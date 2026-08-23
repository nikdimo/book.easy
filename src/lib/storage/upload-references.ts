import "server-only";
import { db } from "@/lib/db";
import { listingDraftData } from "@/lib/mobile-listing-draft";
import type { ListingDraftData } from "@/lib/types/listing-draft";

/**
 * Who still wants a stored file.
 *
 * The single question every deletion in this app has to answer before it touches the
 * disk, and it is answered pessimistically: anything that cannot be ruled out counts as
 * a reason to keep the bytes. An orphaned file costs disk; a wrongly deleted one costs
 * somebody else's photo.
 */

/** How many drafts the text pre-filter is allowed to hand back before the answer falls
 *  back to "assume it is referenced". A `/uploads/<timestamp>-<uuid>.<ext>` path realistically
 *  matches nought or one row, so hitting this at all means something is odd enough that
 *  keeping the file is the right call. */
const DRAFT_CANDIDATE_LIMIT = 100;

/**
 * Every media URL a draft carries, deduplicated and exact.
 *
 * `imageUrls` is the shape older clients wrote before `mediaItems` existed. Both are read
 * because a draft started on an old build and finished on this one can hold either, and a
 * URL only listed in the legacy field is exactly as orphaned as one in the new field.
 */
export function draftUploadUrls(data: ListingDraftData): string[] {
  const fromItems = Array.isArray(data.mediaItems)
    ? data.mediaItems.map((item) => item?.url)
    : [];
  const legacy = Array.isArray(data.imageUrls) ? data.imageUrls : [];
  return [
    ...new Set(
      [...fromItems, ...legacy].filter(
        (url): url is string => typeof url === "string" && url.length > 0,
      ),
    ),
  ];
}

/**
 * Whether one stored draft row genuinely holds this URL.
 *
 * The database pre-filter is a substring test — the photos live inside a JSON blob, so
 * there is no column to match on — and a substring test says yes to
 * `/uploads/photo-1.jpg` when the row only holds `/uploads/photo-1.jpg.backup`. The exact
 * comparison happens here, against the parsed list, so a prefix can never stand in for
 * the whole value.
 *
 * A row whose `data` is not a JSON object at all cannot be listed, and the pre-filter
 * already found the text somewhere inside it. That is treated as a reference: an
 * unreadable draft is exactly the case where guessing wrong is unrecoverable.
 */
export function draftRowReferencesUpload(url: string, data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return true;
  return draftUploadUrls(listingDraftData(data as never)).includes(url);
}

/** Drafts holding this exact URL, whoever owns them. */
async function draftsReferencing(url: string): Promise<boolean> {
  const candidates = await db.$queryRaw<{ id: string; data: unknown }[]>`
    SELECT id, data FROM "ListingDraft"
    WHERE POSITION(${url} IN data::text) > 0
    LIMIT ${DRAFT_CANDIDATE_LIMIT}
  `;
  if (candidates.length >= DRAFT_CANDIDATE_LIMIT) return true;
  return candidates.some((row) => draftRowReferencesUpload(url, row.data));
}

/**
 * True while anything at all still points at this stored file.
 *
 * Meant to be asked *after* whatever row owned the file is already gone, so the thing
 * being deleted cannot count as a reference to its own photos. Every table in the schema
 * that can hold a `/uploads/` path is covered: published listing images, any listing
 * draft, both avatar fields, and the two evidence attachments.
 * (`ListingCalendarFeed.url` is deliberately absent — it holds a remote `.ics`
 * subscription and can never be a managed upload path.)
 */
export async function isUploadStillReferenced(url: string): Promise<boolean> {
  const [images, drafts, users, profiles, damage, safety] = await Promise.all([
    db.listingImage.count({ where: { url } }),
    draftsReferencing(url),
    db.user.count({ where: { image: url } }),
    db.profile.count({ where: { avatarUrl: url } }),
    db.damageReportEvidence.count({ where: { url } }),
    db.safetyCaseEvidence.count({ where: { url } }),
  ]);

  return images > 0 || drafts || users > 0 || profiles > 0 || damage > 0 || safety > 0;
}
