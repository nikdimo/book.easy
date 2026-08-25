import "server-only";
import { db } from "@/lib/db";
import {
  paymentMethodsFromRow,
  validateListingPaymentMethods,
  type ListingPaymentMethodsIssues,
  type ListingPaymentMethodsPreferences,
} from "@/lib/payments/payment-methods";

export const LISTING_PAYMENT_METHODS_SELECT = {
  id: true,
  slug: true,
  status: true,
  acceptedPaymentMethods: true,
  paymentMethodOther: true,
  paymentMethodsReviewedAt: true,
} as const;

export interface ListingPaymentMethodsData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  preferences: ListingPaymentMethodsPreferences;
}

/** Ownership-scoped read shape shared by the future host editor integration. */
export async function getListingPaymentMethodsData(
  listingId: string,
  hostId: string,
): Promise<ListingPaymentMethodsData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: LISTING_PAYMENT_METHODS_SELECT,
  });
  if (!listing) return null;

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    preferences: paymentMethodsFromRow(listing),
  };
}
export type SaveListingPaymentMethodsResult =
  | { error: string }
  | { issues: ListingPaymentMethodsIssues }
  | (ListingPaymentMethodsData & { changed: boolean });

function sameMethods(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((method, index) => method === right[index])
  );
}

/**
 * Saves one listing's complete accepted-method answer.
 *
 * Authorization is part of the lookup: another host's listing is indistinguishable
 * from a missing one. Validation happens again here even when a typed UI called it,
 * because the eventual Server Action is a public POST boundary.
 */
export async function saveListingPaymentMethods(
  listingId: string,
  hostId: string,
  input: unknown,
): Promise<SaveListingPaymentMethodsResult> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: LISTING_PAYMENT_METHODS_SELECT,
  });
  if (!listing) return { error: "Listing not found." };

  const validation = validateListingPaymentMethods(input);
  if (!validation.success) return { issues: validation.issues };

  const current = paymentMethodsFromRow(listing);
  const changed =
    current.status !== "REVIEWED" ||
    !sameMethods(current.methods, validation.value.methods) ||
    current.otherLabel !== validation.value.otherLabel;
  const reviewedAt = new Date();

  const saved = await db.listing.update({
    where: { id: listing.id },
    data: {
      acceptedPaymentMethods: validation.value.methods,
      paymentMethodOther: validation.value.otherLabel,
      paymentMethodsReviewedAt: reviewedAt,
      // Method names and OTHER labels are public listing content. A real change to a
      // live listing follows the same review-queue rule as title and house rules.
      ...(changed && listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
    select: LISTING_PAYMENT_METHODS_SELECT,
  });

  return {
    listing: { id: saved.id, slug: saved.slug, status: saved.status },
    preferences: paymentMethodsFromRow(saved),
    changed,
  };
}
