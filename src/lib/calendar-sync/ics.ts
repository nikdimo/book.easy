/**
 * The iCalendar (RFC 5545) reader and writer behind channel sync.
 *
 * Hand-rolled rather than pulled from npm, for two reasons. The writing side needs
 * exactly one shape — a VCALENDAR of all-day VEVENTs — and the reading side has to be
 * hostile: it parses a document fetched from a URL a host pasted in, so it must never
 * evaluate anything, must ignore everything it doesn't recognise, and must be bounded.
 * A general-purpose parser gives a much larger surface for both.
 *
 * Everything here speaks the same date-only `YYYY-MM-DD` dialect the rest of the
 * calendar does (see lib/utils/date-only), with **exclusive** end dates, matching how
 * AvailabilityBlock and Booking already store a stay. That happens to be exactly what
 * RFC 5545 means by DTEND for a VALUE=DATE event, so no conversion is needed in the
 * common case — see `eventEndYmd` for the datetime case, which is the one that bites.
 */

const CRLF = "\r\n";

/** Fold long lines the way RFC 5545 requires: no content line over 75 octets, the
 *  continuation marked by a leading space. Folding on characters rather than octets
 *  would split multi-byte UTF-8 mid-sequence, so measure in bytes. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let cursor = 0;
  let limit = 75;
  while (cursor < bytes.length) {
    let take = Math.min(limit, bytes.length - cursor);
    // Back off until the slice ends on a character boundary — a UTF-8 continuation
    // byte is 10xxxxxx, so never cut immediately before one.
    while (take > 1 && (bytes[cursor + take] & 0b1100_0000) === 0b1000_0000) take -= 1;
    parts.push(bytes.subarray(cursor, cursor + take).toString("utf8"));
    cursor += take;
    limit = 74; // continuation lines carry a leading space
  }
  return parts.join(`${CRLF} `);
}

/** Escape the characters RFC 5545 reserves inside a TEXT value. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_match, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
}

/** `YYYY-MM-DD` → `YYYYMMDD`, the DATE form of an iCalendar value. */
function ymdToIcsDate(ymd: string): string {
  return ymd.replace(/-/g, "");
}

function utcTimestamp(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

export interface IcsExportEvent {
  /** Globally unique and *stable across exports* — subscribers use it to recognise the
   *  same reservation rather than re-adding it each poll. */
  uid: string;
  startYmd: string;
  /** Exclusive: the first morning the place is free again. */
  endYmd: string;
  summary: string;
}

export interface BuildIcsOptions {
  calendarName: string;
  events: IcsExportEvent[];
  /** Injectable so tests get a fixed DTSTAMP. */
  now?: Date;
}

/**
 * Serialize an availability calendar other platforms can subscribe to.
 *
 * Only dates travel — no guest names, no prices, no booking references. The receiving
 * platform needs to know a night is taken and nothing else, and this feed sits behind a
 * URL token rather than a login, so anything richer would be a leak.
 */
export function buildIcs({ calendarName, events, now = new Date() }: BuildIcsOptions): string {
  const stamp = utcTimestamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Linger Homes//Availability//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymdToIcsDate(event.startYmd)}`,
      `DTEND;VALUE=DATE:${ymdToIcsDate(event.endYmd)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      // Blocking calendars are the whole point of this feed; a subscriber that honours
      // free/busy must read these nights as busy.
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

export interface ParsedIcsEvent {
  uid: string | null;
  startYmd: string;
  /** Exclusive, normalized: always at least one night after `startYmd`. */
  endYmd: string;
  summary: string | null;
}

/** Guards against a hostile or runaway feed. A year of daily events is ~365 VEVENTs;
 *  ten thousand is far past any real calendar and still cheap to hold. */
const MAX_EVENTS = 10_000;

const DATE_VALUE = /^(\d{4})(\d{2})(\d{2})/;

/** Undo RFC 5545 line folding: a CRLF (or bare LF) followed by a space or tab is a
 *  continuation of the line before it, not a new line. */
function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, "").split(/\r\n|\n|\r/);
}

/** Split `DTSTART;VALUE=DATE:20260812` into its name, parameters and value. */
function parseContentLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 1) return null;
  const head = line.slice(0, colon);
  const semicolon = head.indexOf(";");
  return {
    name: (semicolon === -1 ? head : head.slice(0, semicolon)).trim().toUpperCase(),
    params: semicolon === -1 ? "" : head.slice(semicolon + 1).toUpperCase(),
    value: line.slice(colon + 1).trim(),
  };
}

/**
 * The civil date an iCalendar DATE or DATE-TIME value falls on.
 *
 * TZID and the trailing Z are deliberately ignored. A stay is a civil-date fact — the
 * guest checks out on the 15th whatever UTC thinks — and converting `20260815T110000Z`
 * to a local zone risks moving it to the 14th or 16th, which would free or block a
 * night that isn't ours to decide. Every real channel export puts the intended local
 * date in the value itself, so reading the value literally is both simpler and safer.
 */
function toYmd(value: string): string | null {
  const match = DATE_VALUE.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;
  return `${year}-${month}-${day}`;
}

function nextYmd(ymd: string): string {
  const value = new Date(`${ymd}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * Read the blocking events out of an iCalendar document.
 *
 * Unrecognised properties, components (VTIMEZONE, VALARM, VTODO…) and malformed events
 * are skipped rather than rejected: channel exports vary, and one odd VEVENT must not
 * cost a host the other three hundred. Cancelled events are dropped — they are the one
 * status that means "this night is free again".
 */
export function parseIcs(text: string): ParsedIcsEvent[] {
  const events: ParsedIcsEvent[] = [];
  let current: {
    uid: string | null;
    start: string | null;
    end: string | null;
    summary: string | null;
    cancelled: boolean;
  } | null = null;

  for (const line of unfold(text)) {
    const parsed = parseContentLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      current = { uid: null, start: null, end: null, summary: null, cancelled: false };
      continue;
    }
    if (!current) continue;

    if (name === "END" && value.toUpperCase() === "VEVENT") {
      const event = current;
      current = null;
      if (event.cancelled || !event.start) continue;

      // A DATE-valued DTEND is already exclusive; a DATE-TIME one names the checkout
      // morning, whose date is likewise the first free night. Both therefore reduce to
      // "the date part of DTEND" — and a missing or non-advancing DTEND (same-day
      // event, or DTEND before DTSTART in a broken feed) means a single night.
      const end = event.end && event.end > event.start ? event.end : nextYmd(event.start);
      events.push({
        uid: event.uid,
        startYmd: event.start,
        endYmd: end,
        summary: event.summary,
      });
      if (events.length >= MAX_EVENTS) break;
      continue;
    }

    switch (name) {
      case "UID":
        current.uid = unescapeText(value).slice(0, 255);
        break;
      case "SUMMARY":
        current.summary = unescapeText(value).slice(0, 255);
        break;
      case "DTSTART":
        current.start = toYmd(value);
        break;
      case "DTEND":
        current.end = toYmd(value);
        break;
      case "DURATION":
        // Ignored on purpose: DURATION is rare in channel exports and mis-reading it
        // would block the wrong nights. An event with only a DURATION falls back to the
        // single-night default above, which errs toward blocking too little.
        break;
      case "STATUS":
        current.cancelled = value.toUpperCase() === "CANCELLED";
        break;
      case "TRANSP":
        // TRANSPARENT means "does not consume time" — a reminder, not an occupancy.
        if (params.includes("TRANSPARENT") || value.toUpperCase() === "TRANSPARENT") {
          current.cancelled = true;
        }
        break;
      default:
        break;
    }
  }

  return events;
}
