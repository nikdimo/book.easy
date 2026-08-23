"use client";

import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

/**
 * Why a listing is off the site, in the moderator's own words.
 *
 * The overview already said "Changes were rejected — open the listing to see why", which
 * sent the host to the editor to read a note the row could have shown. `moderationNote`
 * is written by an admin when they block a listing and is only ever read here through
 * `getHostListingsOverview`, which is scoped to the signed-in host's own `hostId` — so a
 * note reaches exactly one person, the host who has to act on it.
 *
 * Kept in its own file so the "blank note" and "not blocked at all" branches can be
 * rendered in a test without dragging the whole overview in.
 */

/** The statuses where an admin, not the host, is the reason the listing is not live. */
const BLOCKED = new Set(["REJECTED", "SUSPENDED"]);

export function isModerationBlocked(status: string) {
  return BLOCKED.has(status);
}

export function ListingModerationNotice({
  status,
  note,
  compact = false,
}: {
  status: string;
  note: string | null | undefined;
  /** The grid tile, where the note shares a card with a photo and has to stay to two
   *  lines. The list row gets the note in full. */
  compact?: boolean;
}) {
  const { resolve } = useI18n();
  if (!isModerationBlocked(status)) return null;

  const rejected = status === "REJECTED";
  const trimmed = note?.trim() ?? "";

  const heading = rejected
    ? resolve("host.v2.listings.moderation.rejected_title", "Rejected by our team")
    : resolve("host.v2.listings.moderation.suspended_title", "Suspended by our team");

  // A note is required when an admin suspends, but nothing guarantees one survives a
  // later edit, and older rows predate the field — so a missing note has to say what to
  // do next rather than render an empty box under a red heading.
  const fallback = resolve(
    "host.v2.listings.moderation.no_note",
    "No reason was given. Contact support and we'll explain what needs to change."
  );

  const body = trimmed ? { text: trimmed, translated: false } : fallback;

  return (
    <div
      className={`rounded-lg border border-rose-100 bg-rose-50/70 text-rose-800 ${
        compact ? "mt-2 px-2.5 py-2" : "mt-2 px-3 py-2"
      }`}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        <span translate={heading.translated ? "no" : undefined}>{heading.text}</span>
      </p>
      <p
        className={`mt-1 text-xs leading-5 text-rose-900 ${compact ? "line-clamp-2" : ""}`}
        // The note is free text an admin typed, so it is content rather than UI: the
        // page translator should reach it, the string catalog should not.
        {...(trimmed
          ? { "data-user-generated-content": true, translate: "yes" as const }
          : { translate: body.translated ? ("no" as const) : undefined })}
        title={compact && trimmed ? trimmed : undefined}
      >
        {body.text}
      </p>
    </div>
  );
}
