"use client";

import {
  beginSave,
  endSave,
} from "@/components/host/v2/editor/save-state";
import { updateListingPaymentMethods } from "@/lib/actions/listing-payment-methods.actions";
import { updateListingDepositPolicies } from "@/lib/actions/listing-deposit-policies.actions";
import { updateListingCancellationPolicy } from "@/lib/actions/listing-cancellation-policy.actions";
import { useI18n } from "@/lib/i18n/client";
import type { DepositPoliciesSnapshotV2 } from "@/lib/payments/deposit-policies";
import {
  PaymentArrangementsEditor,
} from "./payment-arrangements-editor";
import {
  draftDetailsToPayload,
  type PaymentArrangementsDraft,
  type PaymentArrangementsValue,
} from "./payment-arrangements-model";
import {
  DepositPoliciesEditor,
  toPayload,
  type DepositPoliciesDraft,
} from "./deposit-policies-editor";
import { CancellationPolicyEditor } from "./cancellation-policy-editor";

/** Connects the reusable editor to the authenticated, owner-scoped Server Action. */
export function PaymentArrangementsWorkspace({
  listingId,
  initialValue,
  initialDeposit,
  listingCurrency,
  initialCancellation,
}: {
  listingId: string;
  initialValue: PaymentArrangementsValue;
  initialDeposit: DepositPoliciesSnapshotV2;
  listingCurrency: string;
  initialCancellation: {
    freeCancellationDaysBeforeCheckIn: number | null;
    reviewedAt: string | null;
  };
}) {
  const { resolve } = useI18n();

  async function save(draft: PaymentArrangementsDraft) {
    beginSave();
    try {
      const result = await updateListingPaymentMethods(listingId, {
        methods: draft.methodCodes,
        otherLabel: draft.otherLabel,
        instructionTemplates: draft.instructionTemplates ?? {},
        instructionDetails: draftDetailsToPayload(draft),
      });
      if ("error" in result || "issues" in result) {
        throw new Error("Payment arrangements were rejected.");
      }
      endSave();
    } catch (error) {
      endSave(true);
      throw error;
    }
  }

  async function saveDeposit(draft: DepositPoliciesDraft) {
    beginSave();
    try {
      // The currency on the wire is only a hint: the Server Action re-reads the
      // listing's own pricing currency and quotes that instead.
      const result = await updateListingDepositPolicies(
        listingId,
        toPayload(draft, listingCurrency),
      );
      if ("error" in result || "issues" in result) {
        throw new Error("Deposit settings were rejected.");
      }
      endSave();
    } catch (error) {
      endSave(true);
      throw error;
    }
  }

  async function saveCancellation(days: number) {
    beginSave();
    try {
      const result = await updateListingCancellationPolicy(listingId, {
        freeCancellationDaysBeforeCheckIn: days,
      });
      if ("error" in result || "issues" in result) {
        throw new Error("Cancellation policy was rejected.");
      }
      endSave();
    } catch (error) {
      endSave(true);
      throw error;
    }
  }

  return (
    // One column, three groups, a rule between them — the composition every other
    // editor section uses. Each child still centres itself inside its own `max-w-3xl`,
    // which is what lets the methods editor be shared with the create flow unchanged;
    // nesting the same clamp twice changes nothing.
    <div className="py-6 md:py-10">
      <PaymentArrangementsEditor
        key={`${listingId}:${initialValue.reviewedAt ?? "unreviewed"}`}
        initialValue={initialValue}
        onSave={save}
        errorMessage={
          resolve(
            "host.editor.payment_arrangements.status_error",
            "Not saved. Check your connection and try again.",
          ).text
        }
      />
      <DepositPoliciesEditor
        initialValue={initialDeposit}
        listingCurrency={listingCurrency}
        onSave={saveDeposit}
      />
      <CancellationPolicyEditor
        initialDays={initialCancellation.freeCancellationDaysBeforeCheckIn}
        reviewedAt={initialCancellation.reviewedAt}
        onSave={saveCancellation}
      />
    </div>
  );
}
