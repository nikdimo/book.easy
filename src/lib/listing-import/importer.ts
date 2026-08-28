import "server-only";

import { randomUUID } from "node:crypto";
import { getStorageAdapter } from "@/lib/storage";
import { assertPublicHttpsUrl as assertPublicUrl } from "@/lib/utils/public-url";
import type {
  ImportedListingData,
  ImportedPriceQuote,
  ListingImportProvider,
} from "@/lib/listing-import/types";
import { providerForUrl } from "@/lib/listing-import/provider";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** A provider listing should normally have far fewer than this. The ceiling is abuse
 * protection, not a product limit: every photo the public page exposes is retained. */
const MAX_IMAGES = 100;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

const IMAGE_TYPES: Record<string, { extension: string; magic: (bytes: Buffer) => boolean }> = {
  "image/jpeg": {
    extension: "jpg",
    magic: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    magic: (bytes) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47,
  },
  "image/webp": {
    extension: "webp",
    magic: (bytes) =>
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP",
  },
};

function assertPublicHttpsUrl(value: string): Promise<URL> {
  return assertPublicUrl(value, {
    protocol: "Only public HTTPS URLs can be imported.",
    privateHost: "Private network URLs cannot be imported.",
    unresolvable: "That URL does not resolve to a public server.",
  });
}

async function safeFetch(
  value: string,
  options: { providerOnly?: ListingImportProvider } = {},
): Promise<Response> {
  let url = await assertPublicHttpsUrl(value);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (
      options.providerOnly &&
      options.providerOnly !== "GENERIC" &&
      providerForUrl(url.href) !== options.providerOnly
    ) {
      throw new Error("The provider redirected to an unsupported website.");
    }
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: options.providerOnly
          ? "text/html,application/xhtml+xml"
          : "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent": "BookEasy-Listing-Importer/1.0",
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }
    const location = response.headers.get("location");
    if (!location) throw new Error("The provider returned an invalid redirect.");
    url = await assertPublicHttpsUrl(new URL(location, url).href);
  }
  throw new Error("The provider redirected too many times.");
}

async function readLimited(response: Response, maximum: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new Error("The remote file is too large to import.");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("The remote file is too large to import.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value: unknown, maximum = 10_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? cleaned.slice(0, maximum) : undefined;
}

function metaTags(html: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[0].matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
      attributes.set(attribute[1].toLowerCase(), decodeHtml(attribute[3]));
    }
    const key = (attributes.get("property") ?? attributes.get("name"))?.toLowerCase();
    const content = attributes.get("content");
    if (key && content) result.set(key, [...(result.get(key) ?? []), content]);
  }
  return result;
}

function jsonLdObjects(html: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed: unknown = JSON.parse(decodeHtml(match[2]).trim());
      const visit = (value: unknown, depth = 0) => {
        if (depth > 8 || !value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          for (const item of value) visit(item, depth + 1);
          return;
        }
        const object = value as Record<string, unknown>;
        objects.push(object);
        if (Array.isArray(object["@graph"])) visit(object["@graph"], depth + 1);
      };
      visit(parsed);
    } catch {
      // A malformed analytics block should not discard valid Open Graph data.
    }
  }
  return objects;
}

function schemaTypes(object: Record<string, unknown>): string[] {
  const raw = object["@type"];
  return (Array.isArray(raw) ? raw : [raw]).filter((value): value is string => typeof value === "string");
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const primitive = value && typeof value === "object"
      ? (value as Record<string, unknown>).value
      : value;
    const parsed = typeof primitive === "number"
      ? primitive
      : typeof primitive === "string"
        ? Number(primitive.replace(/[^\d.,-]/g, "").replace(",", "."))
        : NaN;
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function imageValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imageValues);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return imageValues(object.url ?? object.contentUrl);
  }
  return [];
}

function uniqueStrings(values: (string | undefined)[], maximum: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value, 160);
    const key = cleaned?.toLocaleLowerCase("en");
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maximum) break;
  }
  return result;
}

function uniqueImageUrls(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    try {
      const url = new URL(decodeHtml(value));
      if (url.protocol !== "https:" || url.href.length > 4_000) continue;
      // Airbnb repeats the cover image in Open Graph with resize/query parameters.
      // The original photo path is the identity; importing both would create a
      // duplicate tile that looks like an extra photo.
      const identity = url.hostname.endsWith("muscache.com")
        ? `${url.origin}${url.pathname}`
        : url.href;
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push(url.href);
      if (result.length >= MAX_IMAGES) break;
    } catch {
      // Ignore malformed image candidates while keeping the rest of the listing.
    }
  }
  return result;
}

interface AirbnbPageSignals {
  amenities: string[];
  propertyType?: string;
  spaceType?: string;
  latitude?: number;
  longitude?: number;
  maxGuests?: number;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  city?: string;
  country?: string;
  checkInTime?: string;
  checkOutTime?: string;
  currency?: string;
  nightlyRate?: number;
  priceQuote?: ImportedPriceQuote;
}

/** Currency symbols that name exactly one currency. "$" is deliberately absent: it is
 *  USD, CAD, AUD and several more, and `serverDeterminedCurrency` already says which one
 *  the page is priced in. */
const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP" };

/** The currency a price string states about itself — its symbol, or an ISO code printed
 *  beside the amount. `fallback` is the page's own currency, which covers a bare "$" and
 *  an amount with no marker at all. */
function currencyFromText(value: string, fallback?: string): string | undefined {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (value.includes(symbol)) return code;
  }
  return value.match(/\b[A-Z]{3}\b/)?.[0] ?? fallback;
}

/**
 * How Airbnb names the kind of place in the "<kind> in <City>, <Country>" heading every
 * listing page carries. That heading is the only place a provider page states its city
 * and country in plain text, because the address itself is never published.
 *
 * A kind missing from this list costs the import its city *and* its country. That is
 * what happened to everything hotel-shaped — "Suite in …", "Condo in …", "Rental unit
 * in …" all fell through the old five-word list, and the host reached the Address step
 * with nothing in it but the country dropdown's default.
 */
const AIRBNB_PLACE_KINDS =
  "Room|Home|House|Apartment|Aparthotel|Serviced apartment|Villa|Cabin|Cottage|Loft"
  + "|Studio|Suite|Guest suite|Condo|Townhouse|Bungalow|Chalet|Guesthouse|Hotel"
  + "|Boutique hotel|Bed and breakfast|Rental unit|Farm stay|Tiny home|Boat|Camper|Tent";

/**
 * The nightly rate as Airbnb prints it under the photos: a currency-marked amount that
 * the same phrase ties to a night — "€85 per night", "85 EUR / night", "MKD 5,200 night".
 *
 * The stay-quote line `airbnbPriceQuote` reads ("2 nights x €85.56") deliberately does
 * not match. Nothing there ties a night to the amount that follows it, and its first
 * number is a night count, so a looser pattern would import 2 as the rate.
 */
const AIRBNB_NIGHTLY_RATE =
  /(?:[€£$¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:[€£$¥]|[A-Z]{3}))\s*(?:\/\s*|per\s+|a\s+)?nights?\b/i;

/** A coordinate from a payload that states it as either a number or a numeric string.
 *  The null island is rejected along with anything out of range: both mean the pin is
 *  missing, and a missing pin must not be imported as a real place off Africa. */
function coordinate(value: unknown, limit: number): number | undefined {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) && parsed !== 0 && Math.abs(parsed) <= limit
    ? parsed
    : undefined;
}

/**
 * The first amount in a price string, in whichever of the two separator conventions the
 * provider printed it.
 *
 * Both separators present is unambiguous: the last one is the decimal point. A single
 * separator is not, and the tie is broken by what follows it — exactly three digits is a
 * thousands group, anything shorter is a fraction. Without that rule "MKD 5,200" parsed
 * as 5.2, and a rate imported three orders of magnitude low clears the Price step's
 * floor of 1 rather than being caught by it.
 */
function decimalFromPriceText(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string") return undefined;
  const match = value.replace(/[\u00a0\u202f]/g, " ").match(/\d[\d.,]*/);
  if (!match) return undefined;
  const raw = match[0].replace(/[.,]+$/, "");
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    normalized = raw.replace(decimal === "." ? /,/g : /\./g, "").replace(decimal, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    normalized = raw.length - raw.lastIndexOf(separator) === 4
      ? raw.split(separator).join("")
      : raw.replace(separator, ".");
  } else {
    normalized = raw;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The rate the Price step should open on.
 *
 * A dated link's stay quote is the better source when there is one: it was cross-checked
 * against the stay total, and its pre-discount rate — not the promotional one the guest
 * is being shown — is the number a host is setting here. Most shared links carry no
 * dates, though, and then the price line under the photos is all the page states.
 */
function airbnbNightlyRate(
  priceLines: string[],
  quote: ImportedPriceQuote | undefined,
  currency: string | undefined,
): { amount: number; currency?: string } | undefined {
  const quoted = quote?.originalNightlyRate ?? quote?.currentNightlyRate;
  if (quoted !== undefined && quoted > 0) return { amount: quoted, currency: quote?.currency };
  for (const line of priceLines) {
    const amount = decimalFromPriceText(line);
    if (amount !== undefined && amount > 0) {
      return { amount, currency: currencyFromText(line, currency) };
    }
  }
  return undefined;
}

function airbnbPriceQuote(
  strings: string[],
  sourceUrl: string,
  currency: string | undefined,
): ImportedPriceQuote | undefined {
  if (!currency) return undefined;
  const url = new URL(sourceUrl);
  const checkIn = url.searchParams.get("check_in") ?? undefined;
  const checkOut = url.searchParams.get("check_out") ?? undefined;
  const nightLine = strings.find((value) => /\b\d+\s+nights?\s*[x×]\s*[^\d]*\d/i.test(value));
  if (!nightLine) return undefined;
  const match = nightLine.replace(/[\u00a0\u202f]/g, " ").match(/\b(\d+)\s+nights?\s*[x×]\s*([^\s]+(?:\s*[A-Z]{3})?)/i);
  const nights = match ? Number(match[1]) : undefined;
  const currentNightlyRate = match ? decimalFromPriceText(match[2]) : undefined;
  if (!nights || !currentNightlyRate || currentNightlyRate <= 0) return undefined;
  const quoteCurrency = currencyFromText(nightLine, currency) ?? currency;
  const monetary = strings
    .filter((value) => /[€$£¥]|\b(?:DKK|EUR|USD|GBP|NOK|SEK)\b/i.test(value))
    .map(decimalFromPriceText)
    .filter((value): value is number => value !== undefined && value > 0);
  const currentTotal = monetary.find((value) => Math.abs(value - currentNightlyRate * nights) < 0.02);
  const originalTotal = monetary.find((value) => value > (currentTotal ?? currentNightlyRate * nights) + 0.01);
  const originalNightlyRate = originalTotal ? originalTotal / nights : undefined;
  const explanation = strings.find((value) => /lowered|discount|average rate|promotion|special offer/i.test(value));
  return {
    checkIn,
    checkOut,
    nights,
    currency: quoteCurrency,
    originalNightlyRate,
    currentNightlyRate,
    originalTotal,
    currentTotal: currentTotal ?? currentNightlyRate * nights,
    explanation: explanation?.slice(0, 500),
    capturedAt: new Date().toISOString(),
  };
}

function clockTime(value: string, meridiem: string | undefined): string | undefined {
  const [rawHour, rawMinute = 0] = value.split(":").map(Number);
  if (!Number.isInteger(rawHour) || !Number.isInteger(rawMinute) || rawMinute < 0 || rawMinute > 59) {
    return undefined;
  }
  let hour = rawHour;
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    const upper = meridiem.toUpperCase();
    if (upper === "PM" && hour !== 12) hour += 12;
    if (upper === "AM" && hour === 12) hour = 0;
  }
  if (hour < 0 || hour > 23) return undefined;
  // The listing form intentionally supports half-hour slots only. Keep an exact
  // provider time only when the form can represent it without silently rounding.
  if (rawMinute !== 0 && rawMinute !== 30) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(rawMinute).padStart(2, "0")}`;
}

function timeFromText(value: string, kind: "check-in" | "checkout"): string | undefined {
  const pattern = kind === "check-in"
    ? /check[ -]?in(?:\s+(?:is|time))?\s+(?:after|from|at)?\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i
    : /check[ -]?out(?:\s+(?:is|time))?\s+(?:before|by|at|no later than)?\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i;
  const match = value.replace(/[\u00a0\u202f]/g, " ").match(pattern);
  return match ? clockTime(match[1], match[2]) : undefined;
}

function parseAirbnbSignals(
  html: string,
  meta: Map<string, string[]>,
  knownCity?: string,
  sourceUrl = "https://www.airbnb.com/",
): AirbnbPageSignals {
  const result: AirbnbPageSignals = { amenities: [] };
  const amenityNames: string[] = [];
  const propertyTypes: string[] = [];
  const strings: string[] = [];
  /** Amounts Airbnb itself labelled as a rate per night, in payload order. Read before
   *  the loose scan over `strings`, because a listing page also carries the price of
   *  every listing in its "similar homes" carousel. */
  const nightlyPriceLines: string[] = [];
  /** A pin from a key that is not the listing's own. Held in reserve rather than used:
   *  see where it is applied below. */
  let reservePin: { latitude: number; longitude: number } | undefined;
  const script = html.match(
    /<script\b[^>]*\bid\s*=\s*(["'])data-deferred-state-0\1[^>]*>([\s\S]*?)<\/script>/i,
  )?.[2];
  const currency = html.match(/"serverDeterminedCurrency"\s*:\s*"([A-Z]{3})"/i)?.[1];
  if (currency) result.currency = currency.toUpperCase();

  if (script) {
    try {
      const root: unknown = JSON.parse(script.trim());
      const seen = new Set<object>();
      const visit = (value: unknown, depth = 0) => {
        if (depth > 40 || value == null) return;
        if (typeof value === "string") {
          if (value.length <= 1_000) strings.push(value);
          if (value.length <= 500_000 && /^[\[{]/.test(value.trim())) {
            try {
              visit(JSON.parse(value), depth + 1);
            } catch {
              // Ordinary text beginning with a brace is not necessarily JSON.
            }
          }
          return;
        }
        if (typeof value !== "object" || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) {
          for (const item of value) visit(item, depth + 1);
          return;
        }

        const object = value as Record<string, unknown>;
        if (
          object.__typename === "AmenityItem" &&
          object.available !== false &&
          typeof object.title === "string"
        ) {
          amenityNames.push(object.title);
        }
        if (typeof object.propertyType === "string") propertyTypes.push(object.propertyType);
        if (typeof object.roomType === "string" && !result.spaceType) result.spaceType = object.roomType;
        if (typeof object.personCapacity === "number" && !result.maxGuests) {
          result.maxGuests = object.personCapacity;
        }
        if (typeof object.listingLat === "number" && result.latitude === undefined) {
          result.latitude = object.listingLat;
        }
        if (typeof object.listingLng === "number" && result.longitude === undefined) {
          result.longitude = object.listingLng;
        }
        // Airbnb has moved the pin between payload shapes more than once, and a listing
        // that arrives without one skips the reverse geocode that fills the Address step
        // at all — the host then confirms an address the import never found. A generic
        // pair is kept only as a reserve, first in payload order, because these keys also
        // belong to the map markers of the listings recommended further down the page.
        if (!reservePin) {
          const latitude = coordinate(object.lat ?? object.latitude, 90);
          const longitude = coordinate(object.lng ?? object.longitude, 180);
          if (latitude !== undefined && longitude !== undefined) {
            reservePin = { latitude, longitude };
          }
        }
        // The price line under the photos, as Airbnb structures it: an amount beside a
        // qualifier that names the night. The pre-discount amount first — a host is
        // setting their own rate here, not the promotion a guest is being shown.
        if (typeof object.qualifier === "string" && /night/i.test(object.qualifier)) {
          for (const key of ["originalPrice", "price", "discountedPrice"]) {
            const amount = object[key];
            if (typeof amount === "string") nightlyPriceLines.push(amount);
          }
        }
        for (const child of Object.values(object)) visit(child, depth + 1);
      };
      visit(root);
    } catch {
      // Airbnb can change this private payload independently of its stable JSON-LD.
      // The generic parser remains a useful fallback when that happens.
    }
  }

  result.amenities = uniqueStrings(amenityNames, 250);
  result.propertyType = propertyTypes.find((type) => /^[A-Z][A-Z_]+$/.test(type))
    ?? propertyTypes.find((type) => !/private|shared|entire/i.test(type));
  result.spaceType ??= propertyTypes.find((type) => /private|shared|entire|hotel room/i.test(type));

  const sharingTitle = meta.get("og:title")?.[0] ?? strings.find((value) => /\d+\s+beds?/i.test(value));
  if (sharingTitle) {
    result.bedrooms = firstNumber(sharingTitle.match(/(\d+(?:\.\d+)?)\s+bedrooms?\b/i)?.[1]);
    result.beds = firstNumber(sharingTitle.match(/(\d+(?:\.\d+)?)\s+beds?\b/i)?.[1]);
    result.bathrooms = firstNumber(
      sharingTitle.match(/(\d+(?:\.\d+)?)\s+(?:(?:private|shared)\s+)?baths?\b/i)?.[1],
    );
    if (!result.propertyType) {
      const label = sharingTitle.match(/^(Home|House|Apartment|Villa|Cabin|Cottage|Loft|Studio)\s+in\b/i)?.[1];
      if (label) result.propertyType = label.toUpperCase();
    }
  }

  // One vocabulary, three uses: the two ways a candidate line is found and the pattern
  // that then reads the city and country out of it. Written out three times, they drifted
  // — which is a silent loss of the only address signal the page carries.
  // Built once rather than per candidate: `strings` is every string in the payload, and
  // that is tens of thousands of them on a busy listing.
  const headingInString = new RegExp(`\\b(?:${AIRBNB_PLACE_KINDS})\\s+in\\s+[^,]+,`, "i");
  const headingInHtml = new RegExp(
    `(?:${AIRBNB_PLACE_KINDS})\\s+in\\s+([^,<>{}"\\\\]{2,80}),\\s*([^<>{}"\\\\]{2,80})`,
    "gi",
  );
  const locationPattern = new RegExp(
    `\\b(?:${AIRBNB_PLACE_KINDS})\\s+in\\s+([^,\\n]{2,80}),\\s*([^,\\n·]{2,80})`,
    "i",
  );
  const locationCandidates = [
    ...strings.filter((value) => headingInString.test(value)),
    ...Array.from(html.matchAll(headingInHtml)).map((match) => match[0]),
  ];
  const parsedLocations: { city: string; country: string; score: number }[] = [];
  for (const candidate of locationCandidates) {
    const location = candidate.match(locationPattern);
    if (!location) continue;
    const city = cleanText(location[1], 120);
    const country = cleanText(location[2], 120);
    if (!city || !country || /review|rating|bed|bath|plus access|shared spaces|according to/i.test(`${city} ${country}`)) continue;
    const score = knownCity && city.toLowerCase() === knownCity.toLowerCase() ? 10 : 0;
    parsedLocations.push({ city, country, score });
  }
  const bestLocation = parsedLocations.sort((a, b) => b.score - a.score)[0];
  if (bestLocation) {
    result.city = bestLocation.city;
    result.country = bestLocation.country;
  }

  for (const value of strings) {
    result.checkInTime ??= timeFromText(value, "check-in");
    result.checkOutTime ??= timeFromText(value, "checkout");
    if (result.checkInTime && result.checkOutTime) break;
  }
  const description = meta.get("description")?.[0] ?? meta.get("og:description")?.[0];
  if (description) {
    result.checkInTime ??= timeFromText(description, "check-in");
    result.checkOutTime ??= timeFromText(description, "checkout");
  }
  // Only when the listing's own key gave nothing: a reserve pin that turns out to belong
  // to a neighbouring listing is still a pin in the right town, which is all the reverse
  // geocode below needs, and the host confirms the exact spot on the map either way.
  if (result.latitude === undefined || result.longitude === undefined) {
    result.latitude = reservePin?.latitude;
    result.longitude = reservePin?.longitude;
  }

  result.priceQuote = airbnbPriceQuote(strings, sourceUrl, result.currency);
  const rate = airbnbNightlyRate(
    [
      ...nightlyPriceLines,
      ...strings
        .map((value) => value.replace(/[\u00a0\u202f]/g, " ").match(AIRBNB_NIGHTLY_RATE)?.[0])
        .filter((value): value is string => value !== undefined),
    ],
    result.priceQuote,
    result.currency,
  );
  if (rate) {
    result.nightlyRate = rate.amount;
    // The amount and its currency are read off the same string, so they travel together.
    // Storing the rate under the page's `serverDeterminedCurrency` while the number came
    // from a "£" line would relabel the host's money without converting it.
    result.currency = rate.currency ?? result.currency;
  }
  return result;
}

export function parseListingHtml(
  html: string,
  sourceUrl: string,
  provider: ListingImportProvider,
): ImportedListingData {
  const meta = metaTags(html);
  const schemas = jsonLdObjects(html);
  const lodging = schemas.find((object) =>
    schemaTypes(object).some((type) =>
      /lodging|hotel|apartment|house|accommodation|vacationrental|product/i.test(type),
    ),
  ) ?? schemas[0] ?? {};

  const address = lodging.address && typeof lodging.address === "object"
    ? lodging.address as Record<string, unknown>
    : {};
  const geo = lodging.geo && typeof lodging.geo === "object"
    ? lodging.geo as Record<string, unknown>
    : {};
  const rawOffers = Array.isArray(lodging.offers) ? lodging.offers[0] : lodging.offers;
  const offers = rawOffers && typeof rawOffers === "object"
    ? rawOffers as Record<string, unknown>
    : {};
  const occupancy = lodging.occupancy && typeof lodging.occupancy === "object"
    ? lodging.occupancy as Record<string, unknown>
    : {};
  const features = Array.isArray(lodging.amenityFeature) ? lodging.amenityFeature : [];
  const additional = Array.isArray(lodging.additionalProperty) ? lodging.additionalProperty : [];
  const propertyNumbers = new Map<string, number>();
  for (const entry of additional) {
    if (!entry || typeof entry !== "object") continue;
    const property = entry as Record<string, unknown>;
    const name = cleanText(property.name, 80)?.toLowerCase();
    const number = firstNumber(property.value);
    if (name && number !== undefined) propertyNumbers.set(name, number);
  }
  const propertyNumber = (pattern: RegExp) => {
    for (const [name, value] of propertyNumbers) if (pattern.test(name)) return value;
    return undefined;
  };

  const amenities = uniqueStrings(
    features.flatMap((feature) => {
      if (typeof feature === "string") return [feature];
      if (!feature || typeof feature !== "object") return [];
      const object = feature as Record<string, unknown>;
      return object.value === false ? [] : [cleanText(object.name, 160)];
    }),
    100,
  );
  const imageUrls = uniqueImageUrls(
    [
      ...imageValues(lodging.image),
      ...(meta.get("og:image") ?? []),
      ...(meta.get("twitter:image") ?? []),
    ],
  );
  const pageTitle = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200);
  const rawType = schemaTypes(lodging).find((type) => !/product|lodgingbusiness/i.test(type));
  const currency = cleanText(
    offers.priceCurrency ?? meta.get("product:price:currency")?.[0],
    3,
  )?.toUpperCase();
  const priceSpecification = offers.priceSpecification && typeof offers.priceSpecification === "object"
    ? offers.priceSpecification as Record<string, unknown>
    : {};
  const unitText = cleanText(offers.unitText ?? priceSpecification.unitText, 40);
  const schemaNightlyRate = unitText && /night|day/i.test(unitText)
    ? firstNumber(offers.price, priceSpecification.price)
    : undefined;
  const metaNightlyRate = meta.has("product:price:currency")
    ? firstNumber(meta.get("product:price:amount")?.[0])
    : undefined;

  const generic: ImportedListingData = {
    provider,
    sourceUrl,
    title: cleanText(lodging.name ?? lodging.headline ?? meta.get("og:title")?.[0] ?? pageTitle, 200),
    description: cleanText(lodging.description ?? meta.get("og:description")?.[0] ?? meta.get("description")?.[0]),
    propertyType: cleanText(lodging.additionalType ?? rawType, 100),
    address: cleanText(address.streetAddress, 250),
    city: cleanText(address.addressLocality, 120),
    area: cleanText(address.addressRegion, 120),
    postalCode: cleanText(address.postalCode, 30),
    country: cleanText(
      typeof address.addressCountry === "object"
        ? (address.addressCountry as Record<string, unknown>).name
        : address.addressCountry,
      120,
    ),
    latitude: firstNumber(geo.latitude, lodging.latitude),
    longitude: firstNumber(geo.longitude, lodging.longitude),
    maxGuests: firstNumber(occupancy.maxValue, lodging.numberOfGuests, propertyNumber(/guest|occupancy/)),
    bedrooms: firstNumber(lodging.numberOfBedrooms, propertyNumber(/bedroom/)),
    beds: firstNumber(lodging.numberOfBeds, propertyNumber(/^beds?|sleeping/)),
    bathrooms: firstNumber(lodging.numberOfBathroomsTotal, propertyNumber(/bathroom/)),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
    nightlyRate: schemaNightlyRate ?? metaNightlyRate,
    amenities,
    imageUrls,
  };

  if (provider !== "AIRBNB") return generic;
  const airbnb = parseAirbnbSignals(html, meta, generic.city, sourceUrl);
  return {
    ...generic,
    propertyType: airbnb.propertyType ?? generic.propertyType,
    spaceType: airbnb.spaceType,
    city: airbnb.city ?? generic.city,
    country: airbnb.country ?? generic.country,
    latitude: airbnb.latitude ?? generic.latitude,
    longitude: airbnb.longitude ?? generic.longitude,
    maxGuests: airbnb.maxGuests ?? generic.maxGuests,
    bedrooms: airbnb.bedrooms ?? generic.bedrooms,
    beds: airbnb.beds ?? generic.beds,
    bathrooms: airbnb.bathrooms ?? generic.bathrooms,
    currency: airbnb.currency ?? generic.currency,
    // Airbnb publishes no schema offer, so `generic.nightlyRate` is always empty here and
    // the Price step used to open blank on every imported listing — including the ones
    // whose stay quote had already been read and stored beside it.
    nightlyRate: airbnb.nightlyRate ?? generic.nightlyRate,
    priceQuote: airbnb.priceQuote,
    amenities: uniqueStrings([...airbnb.amenities, ...generic.amenities], 250),
    checkInTime: airbnb.checkInTime,
    checkOutTime: airbnb.checkOutTime,
    locationApproximate: generic.latitude !== undefined || airbnb.latitude !== undefined,
  };
}

export async function importListingUrl(value: string): Promise<ImportedListingData> {
  const provider = providerForUrl(value);
  if (!provider) {
    throw new Error("Paste a valid public HTTPS property or accommodation link.");
  }
  const response = await safeFetch(value, { providerOnly: provider });
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 429
        ? "The provider blocked this import. Try again later or enter the details manually."
        : `The provider could not be read (HTTP ${response.status}).`,
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("That link did not return a listing page.");
  }
  const html = (await readLimited(response, MAX_HTML_BYTES)).toString("utf8");
  const imported = parseListingHtml(html, response.url || value, provider);
  if (!imported.title && !imported.description && imported.imageUrls.length === 0) {
    throw new Error("No public listing details were found on that page.");
  }
  return imported;
}

export async function copyImportedImages(
  urls: string[],
): Promise<{ url: string; mediaType: "IMAGE" }[]> {
  const storage = getStorageAdapter();
  const candidates = urls.slice(0, MAX_IMAGES);
  const results: ({ url: string; mediaType: "IMAGE" } | undefined)[] = new Array(candidates.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        const response = await safeFetch(candidates[index]);
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const type = IMAGE_TYPES[contentType];
        if (!type) continue;
        const bytes = await readLimited(response, MAX_IMAGE_BYTES);
        if (!type.magic(bytes)) continue;
        const url = await storage.upload(bytes, `${randomUUID()}.${type.extension}`, contentType);
        results[index] = { url, mediaType: "IMAGE" };
      } catch {
        // Individual photos can expire or be protected; keep the useful ones.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, worker));
  return results.filter((item): item is { url: string; mediaType: "IMAGE" } => Boolean(item));
}
