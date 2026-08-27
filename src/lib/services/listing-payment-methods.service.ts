import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  paymentMethodsFromRow,
  validateListingPaymentMethods,
  type ListingPaymentMethodsIssues,
  type ListingPaymentMethodsPreferences,
} from "@/lib/payments/payment-methods";
import {
  parsePaymentInstructionStore,
  paymentInstructionStoreSnapshot,
  samePaymentInstructionTemplates,
  validatePaymentInstructionTemplates,
  validatePaymentMethodDetailsMap,
  type PaymentDetailsMapIssue,
  type PaymentInstructionTemplateIssue,
  type PaymentInstructionTemplates,
} from "@/lib/payments/payment-instruction-templates";
import {
  samePaymentMethodDetailsMap,
  type PaymentDetailIssues,
  type PaymentMethodDetailsMap,
} from "@/lib/payments/payment-details";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";

export const LISTING_PAYMENT_METHODS_SELECT = {
  id: true,
  slug: true,
  status: true,
  acceptedPaymentMethods: true,
  paymentMethodOther: true,
  paymentMethodsReviewedAt: true,
  paymentInstructionTemplates: true,
} as const;

export interface ListingPaymentMethodsData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  preferences: ListingPaymentMethodsPreferences;
  /** Owner-only data. Never reuse this service in a public listing response. */
  instructionTemplates: PaymentInstructionTemplates;
  /** Owner-only V2 structured details, keyed by method. Equally never public. */
  instructionDetails: PaymentMethodDetailsMap;
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

  const store = parsePaymentInstructionStore(listing.paymentInstructionTemplates);
  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    preferences: paymentMethodsFromRow(listing),
    instructionTemplates: store.templates,
    instructionDetails: store.details,
  };
}
export type SaveListingPaymentMethodsResult =
  | { error: string }
  | {
      issues: ListingPaymentMethodsIssues & {
        instructionTemplates?: PaymentInstructionTemplateIssue;
        instructionDetails?: PaymentDetailsMapIssue;
        /** Per-method, per-field problems the editor renders beside the field. */
        detailFields?: Partial<Record<PaymentMethodCode, PaymentDetailIssues>>;
      };
    }
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

  const raw = input as Record<string, unknown>;
  const currentStore = parsePaymentInstructionStore(
    listing.paymentInstructionTemplates,
  );

  // Legacy V1 free text is only ever carried forward from what is already stored, or
  // pruned for a method the host converted. The editor no longer authors it, so a
  // request that omits `instructionTemplates` keeps every legacy paragraph intact.
  const templateInput =
    raw.instructionTemplates === undefined
      ? currentStore.templates
      : raw.instructionTemplates;
  const templateValidation = validatePaymentInstructionTemplates(
    templateInput,
    validation.value.methods,
  );
  if (!templateValidation.success) {
    return { issues: { instructionTemplates: templateValidation.issue } };
  }

  const detailsValidation = validatePaymentMethodDetailsMap(
    raw.instructionDetails === undefined
      ? currentStore.details
      : raw.instructionDetails,
    validation.value.methods,
    currentStore.details,
  );
  if (!detailsValidation.success) {
    return {
      issues: {
        ...(detailsValidation.issue
          ? { instructionDetails: detailsValidation.issue }
          : {}),
        ...(detailsValidation.fieldIssues
          ? { detailFields: detailsValidation.fieldIssues }
          : {}),
      },
    };
  }

  const current = paymentMethodsFromRow(listing);
  const publicChanged =
    current.status !== "REVIEWED" ||
    !sameMethods(current.methods, validation.value.methods) ||
    current.otherLabel !== validation.value.otherLabel;
  const changed =
    publicChanged ||
    !samePaymentInstructionTemplates(
      currentStore.templates,
      templateValidation.value,
    ) ||
    !samePaymentMethodDetailsMap(currentStore.details, detailsValidation.value);
  const reviewedAt = new Date();

  const saved = await db.listing.update({
    where: { id: listing.id },
    data: {
      acceptedPaymentMethods: validation.value.methods,
      paymentMethodOther: validation.value.otherLabel,
      paymentMethodsReviewedAt: reviewedAt,
      paymentInstructionTemplates: paymentInstructionStoreSnapshot({
        templates: templateValidation.value,
        details: detailsValidation.value,
      }) as unknown as Prisma.InputJsonObject,
      // Method names and OTHER labels are public listing content. A real change to a
      // live listing follows the same review-queue rule as title and house rules.
      ...(publicChanged && listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
    select: LISTING_PAYMENT_METHODS_SELECT,
  });

  const savedStore = parsePaymentInstructionStore(saved.paymentInstructionTemplates);
  return {
    listing: { id: saved.id, slug: saved.slug, status: saved.status },
    preferences: paymentMethodsFromRow(saved),
    instructionTemplates: savedStore.templates,
    instructionDetails: savedStore.details,
    changed,
  };
}
