"use server";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import {
  HOST_START_COOKIE_OPTIONS,
  HOST_START_DRAFT_COOKIE,
} from "@/lib/host-start-draft";
import { deleteOwnedListingDraftWithCleanup } from "@/lib/listing-draft-cleanup";
import {
  listingDraftData,
  mergeMobileListingDraft,
  parseMobileListingDraftPatch,
} from "@/lib/mobile-listing-draft";
import { submitNewListing } from "@/lib/actions/listing.actions";
import { enqueueUploadDeletions, sweepUploads } from "@/lib/storage/upload-cleanup";
import { draftUploadUrls } from "@/lib/storage/upload-references";
import { validCoordinates } from "@/lib/host/v2/listing-location";
import { HOUSE_RULES_DRAFT_FIELDS } from "@/lib/host/v2/listing-house-rules-draft";
import { getDisplayCurrency } from "@/lib/currency/server";
import type { ListingDraftData } from "@/lib/types/listing-draft";

export type HostStartDraftPatch = Partial<ListingDraftData>;

async function ownedDraftFromCookie(hostId: string) {
  const store = await cookies();
  const draftId = store.get(HOST_START_DRAFT_COOKIE)?.value;
  if (!draftId) return null;
  return db.listingDraft.findFirst({ where: { id: draftId, hostId } });
}

export async function saveHostStartDraftPatch(input: unknown): Promise<
  | { success: true; draftId: string; data: ListingDraftData }
  | { error: string }
> {
  const host = await requireHost();
  const parsed = parseMobileListingDraftPatch(input);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid listing draft data" };

  const store = await cookies();
  const requestedId = store.get(HOST_START_DRAFT_COOKIE)?.value;
  let draft: { id: string; data: Prisma.JsonValue } | null = null;
  let queued: string[] = [];

  if (requestedId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await db.listingDraft.findFirst({
        where: { id: requestedId, hostId: host.id },
      });
      if (!existing) break;

      const before = listingDraftData(existing.data);
      const merged = listingDraftData(
        mergeMobileListingDraft(existing.data, parsed.data) as unknown as Prisma.JsonValue,
      );
      // Keep the legacy list aligned when a current client replaces the ordered media
      // list. Otherwise a removed file can remain falsely referenced forever.
      if (parsed.data.mediaItems !== undefined) {
        merged.imageUrls = parsed.data.mediaItems
          .filter((item) => item.mediaType === "IMAGE")
          .map((item) => item.url);
      }
      const afterUrls = new Set(draftUploadUrls(merged));
      const removed = draftUploadUrls(before).filter((url) => !afterUrls.has(url));

      const outcome = await db.$transaction(async (tx) => {
        const updated = await tx.listingDraft.updateMany({
          where: { id: existing.id, hostId: host.id, updatedAt: existing.updatedAt },
          data: { data: merged as unknown as Prisma.InputJsonValue },
        });
        if (updated.count === 0) return null;
        return enqueueUploadDeletions(tx, removed, "draft-media-replaced");
      });
      if (outcome === null) continue;
      queued = outcome;
      draft = { id: existing.id, data: merged as unknown as Prisma.JsonValue };
      break;
    }
    if (!draft) {
      // If the row still exists after repeated compare-and-swap losses, returning an
      // error is safer than creating a second draft and splitting the host's work.
      const stillExists = await db.listingDraft.findFirst({
        where: { id: requestedId, hostId: host.id },
        select: { id: true },
      });
      if (stillExists) return { error: "Your listing changed in another window. Please try again." };
    }
  }

  // A stale or foreign cookie never grants access and never prevents a host from
  // starting over. It is replaced with a new, owned draft.
  if (!draft) {
    const merged = mergeMobileListingDraft(null, parsed.data) as unknown as ListingDraftData;
    /*
     * The listing's own currency, decided once, here, at the moment the draft comes
     * into existence — and taken from the currency the host is currently reading the
     * site in rather than from a platform constant. A host browsing in DKK who starts
     * a listing is thinking in DKK, and defaulting them to EUR means either a wrong
     * price or a currency change later, and a currency change is the one thing this
     * flow must never do silently.
     *
     * Only ever a *seed*: a patch that already names a currency (an imported listing
     * arrives with one) keeps it, and once written this value is the draft's own — a
     * later display-currency change does not reach back and rewrite it.
     */
    if (!merged.currency) merged.currency = await getDisplayCurrency();
    const created = await db.listingDraft.create({
      data: { hostId: host.id, data: merged as unknown as Prisma.InputJsonValue },
    });
    draft = { id: created.id, data: created.data };
  }

  if (queued.length > 0) await sweepUploads(queued, `draft-media-replaced:${draft.id}`);

  store.set(HOST_START_DRAFT_COOKIE, draft.id, HOST_START_COOKIE_OPTIONS);
  revalidatePath("/host/listings");
  return {
    success: true,
    draftId: draft.id,
    data: listingDraftData(draft.data),
  };
}

function appendDraftToFormData(formData: FormData, data: ListingDraftData) {
  const textFields = [
    "title", "description", "propertyType", "spaceType", "address", "city",
    "area", "postalCode", "country", "latitude", "longitude", "locationSource",
    "locationConfirmed", "geocodingProvider", "geocodingPlaceId",
    "geocodingConfidence", "streetViewHeading", "streetViewPitch",
    "streetViewPanoId", "bedrooms", "bathrooms", "beds",
    "currency", "baseNightlyRate", "cleaningFee", "minNights",
    "promotionType", "promotionPercent",
    "promotionMinimumNights", "promotionFreeCleaning",
    // Every house-rules field, from the list the draft module owns — including
    // maxGuests and the arrival pair, which are house rules too. Spelling them out
    // here again is how one of them gets forgotten when a rule is added.
    ...HOUSE_RULES_DRAFT_FIELDS,
  ] as const;
  for (const field of textFields) {
    const value = data[field];
    if (value !== undefined && value !== null) formData.set(field, String(value));
  }
  // Host V2 trusts the pin the host placed and the address they typed: neither is
  // re-confirmed on a later screen, so nothing in this flow ever writes the
  // `locationConfirmed` flag the publish schema still asks for. Coordinates that are a
  // real place on Earth *are* the confirmation, and they can only be there because the
  // host put them there — so they are asserted here rather than by relaxing the schema,
  // which still refuses a draft that carries no usable pin at all.
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (validCoordinates(latitude, longitude)) {
    formData.set("locationConfirmed", "true");
    // An imported draft writes its own source ("import"); only a draft with coordinates
    // and no recorded source at all needs one, and a pin with no provider behind it is
    // exactly a manual one.
    if (!(data.locationSource ?? "").trim()) formData.set("locationSource", "MANUAL_PIN");
  }

  for (const amenityId of data.amenityIds ?? []) {
    formData.append("amenityIds", amenityId);
  }
  for (const item of data.mediaItems ?? []) {
    formData.append("mediaItems", JSON.stringify(item));
  }
  formData.set("prePublishPlan", JSON.stringify(data.prePublishPlan ?? null));
}

export async function publishHostStartDraft(): Promise<
  | { success: true; listingId: string; slug: string }
  | { error: string }
> {
  const host = await requireHost();
  const draft = await ownedDraftFromCookie(host.id);
  if (!draft) return { error: "Your listing draft could not be found. Start a new listing and try again." };

  const data = listingDraftData(draft.data);
  const formData = new FormData();
  appendDraftToFormData(formData, data);
  const result = await submitNewListing(formData, draft.id);
  if ("error" in result) return result;

  const store = await cookies();
  store.delete(HOST_START_DRAFT_COOKIE);
  revalidatePath("/host/listings");
  return result;
}

export async function abandonHostStartDraft() {
  const host = await requireHost();
  const draft = await ownedDraftFromCookie(host.id);
  if (draft) {
    // Shared with every other delete path, so throwing the wizard away takes its uploaded
    // photos with it rather than leaving them on disk with nothing pointing at them.
    await deleteOwnedListingDraftWithCleanup({ hostId: host.id, draftId: draft.id });
  }
  // Cleared even when there was no row to delete: a stale selector is exactly what strands
  // the next visit on a draft that is already gone.
  const store = await cookies();
  store.delete(HOST_START_DRAFT_COOKIE);
  revalidatePath("/host/listings");
  return { success: true } as const;
}
