import "server-only";
import { db } from "@/lib/db";
import {
  paymentCopyPayloadFromRow,
  paymentCopySourceFromRow,
  type PaymentCopyPayload,
  type PaymentCopySource,
} from "@/lib/payments/payment-copy";

/**
 * The owner-scoped reads behind "copy payment details from another listing".
 *
 * Both queries scope by `hostId` in the `where`, so another host's listing is
 * indistinguishable from one that does not exist — the same rule
 * `listing-payment-methods.service` follows, for the same reason: this is private host
 * content, and a 404 must not become a probe.
 *
 * Neither function writes. The copy itself happens in the host's browser, and the
 * payment section's own Save is still the only thing that persists it.
 */

export type { PaymentCopyPayload, PaymentCopySource };

const COPY_SOURCE_SELECT = {
  id: true,
  title: true,
  acceptedPaymentMethods: true,
  paymentMethodOther: true,
  paymentMethodsReviewedAt: true,
  paymentInstructionTemplates: true,
} as const;

/**
 * The host's other listings that have an answer worth copying, newest answer first.
 *
 * Newest first because the answer a host saved most recently is the one they are most
 * likely to want again — a host setting up their fourth apartment this week is copying
 * the third, not the one from two years ago.
 */
export async function listPaymentCopySources(
  hostId: string,
  excludeListingId?: string,
): Promise<PaymentCopySource[]> {
  const listings = await db.listing.findMany({
    where: {
      hostId,
      paymentMethodsReviewedAt: { not: null },
      ...(excludeListingId ? { id: { not: excludeListingId } } : {}),
    },
    select: COPY_SOURCE_SELECT,
    orderBy: { paymentMethodsReviewedAt: "desc" },
  });

  return listings
    .map((listing) => paymentCopySourceFromRow(listing))
    .filter((source): source is PaymentCopySource => source !== null);
}

/**
 * One source listing's full payment answer, private details included.
 *
 * Owner-facing: this is the same class of data the payment editor already loads into the
 * host's own browser for the listing they are on. It must never reach a public listing
 * or booking DTO.
 */
export async function getPaymentCopyPayload(
  sourceListingId: string,
  hostId: string,
): Promise<PaymentCopyPayload | null> {
  const listing = await db.listing.findFirst({
    where: { id: sourceListingId, hostId },
    select: COPY_SOURCE_SELECT,
  });
  if (!listing) return null;
  return paymentCopyPayloadFromRow(listing);
}
