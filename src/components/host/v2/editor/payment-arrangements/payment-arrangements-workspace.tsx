"use client";

import {
  beginSave,
  endSave,
} from "@/components/host/v2/editor/save-state";
import { updateListingPaymentMethods } from "@/lib/actions/listing-payment-methods.actions";
import { updateListingDepositPolicy } from "@/lib/actions/listing-deposit-policy.actions";
import { useI18n } from "@/lib/i18n/client";
import type { DepositPolicySnapshotV1 } from "@/lib/payments/deposit-policy";
import {
  PaymentArrangementsEditor,
} from "./payment-arrangements-editor";
import type {
  PaymentArrangementsDraft,
  PaymentArrangementsValue,
} from "./payment-arrangements-model";
import {
  DepositPolicyEditor,
  type DepositPolicyDraft,
} from "./deposit-policy-editor";

/** Connects the reusable editor to the authenticated, owner-scoped Server Action. */
export function PaymentArrangementsWorkspace({
  listingId,
  initialValue,
  initialDeposit,
  listingCurrency,
}: {
  listingId: string;
  initialValue: PaymentArrangementsValue;
  initialDeposit: DepositPolicySnapshotV1;
  listingCurrency: string;
}) {
  const { resolve } = useI18n();

  async function save(draft: PaymentArrangementsDraft) {
    beginSave();
    try {
      const result = await updateListingPaymentMethods(listingId, {
        methods: draft.methodCodes,
        otherLabel: draft.otherLabel,
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

  async function saveDeposit(draft: DepositPolicyDraft) {
    beginSave();
    try {
      const result = await updateListingDepositPolicy(listingId, draft);
      if ("error" in result || "issues" in result) {
        throw new Error("Deposit policy was rejected.");
      }
      endSave();
    } catch (error) {
      endSave(true);
      throw error;
    }
  }

  return (
    <>
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
      <DepositPolicyEditor
        initialValue={initialDeposit}
        listingCurrency={listingCurrency}
        onSave={saveDeposit}
      />
    </>
  );
}
