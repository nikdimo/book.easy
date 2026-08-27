"use server";

import { revalidatePath } from "next/cache";
import { requireHost } from "@/lib/auth-helpers";
import {
  saveListingPaymentMethods,
  type SaveListingPaymentMethodsResult,
} from "@/lib/services/listing-payment-methods.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export type UpdateListingPaymentMethodsResult =
  | { error: string }
  | {
      issues: import("@/lib/payments/payment-methods").ListingPaymentMethodsIssues & {
        instructionTemplates?: import("@/lib/payments/payment-instruction-templates").PaymentInstructionTemplateIssue;
        instructionDetails?: import("@/lib/payments/payment-instruction-templates").PaymentDetailsMapIssue;
        detailFields?: Partial<
          Record<
            import("@/lib/payments/payment-methods").PaymentMethodCode,
            import("@/lib/payments/payment-details").PaymentDetailIssues
          >
        >;
      };
    }
  | {
      methods: import("@/lib/payments/payment-methods").PaymentMethodCode[];
      otherLabel: string | null;
      reviewedAt: string;
    };

function refresh(
  result: Extract<SaveListingPaymentMethodsResult, { changed: boolean }>,
) {
  const { id, slug, status } = result.listing;
  revalidatePath(`/host/listings/${id}/payment-arrangements`);
  revalidatePath(`/host/listings/${id}`);
  revalidatePath(`/host/listings/${id}/edit`);
  // Today carries the persistent post-listing payment task. Refresh it as soon as
  // either answer changes so returning there cannot show a stale reminder.
  revalidatePath("/host");
  if (result.changed && status === "APPROVED") {
    revalidatePath(`/properties/${slug}`);
    revalidatePublicListingCaches();
  }
}

/** Authenticated, owner-scoped mutation boundary for future host UI wiring. */
export async function updateListingPaymentMethods(
  listingId: string,
  input: unknown,
): Promise<UpdateListingPaymentMethodsResult> {
  const host = await requireHost();
  const result = await saveListingPaymentMethods(listingId, host.id, input);
  if ("error" in result) return { error: result.error };
  if ("issues" in result) return { issues: result.issues };

  refresh(result);
  return {
    methods: result.preferences.methods,
    otherLabel: result.preferences.otherLabel,
    // A successful save always stamps review time; the explicit guard keeps the
    // action's serialized return contract honest if that invariant ever changes.
    reviewedAt: result.preferences.reviewedAt!.toISOString(),
  };
}
