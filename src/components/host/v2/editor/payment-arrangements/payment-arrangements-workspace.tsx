"use client";

import { useState } from "react";
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
import {
  PaymentArrangementsTabPanel,
  PaymentArrangementsTabStrip,
  type PaymentArrangementsTabId,
} from "./payment-arrangements-tabs";

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
  const [tab, setTab] = useState<PaymentArrangementsTabId>("methods");
  const tabs: { id: PaymentArrangementsTabId; label: string }[] = [
    {
      id: "methods",
      label: resolve(
        "host.editor.payment_arrangements.tab_methods",
        "Payment methods",
      ).text,
    },
    {
      id: "deposits",
      label: resolve("host.editor.payment_arrangements.tab_deposits", "Deposits")
        .text,
    },
    {
      id: "cancellation",
      label: resolve("host.editor.cancellation.heading", "Cancellation policy")
        .text,
    },
  ];

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
    // Three tabs, one visible at a time. Each panel keeps the `max-w-3xl` clamp its
    // editor already carried, which is what lets the methods editor stay shared with
    // the create flow unchanged.
    <div className="py-6 md:py-10">
      <PaymentArrangementsTabStrip tabs={tabs} active={tab} onSelect={setTab} />

      <PaymentArrangementsTabPanel id="methods" active={tab === "methods"}>
        <PaymentArrangementsEditor
          key={`${listingId}:${initialValue.reviewedAt ?? "unreviewed"}`}
          initialValue={initialValue}
          onSave={save}
          showCopyFromListing
          copyExcludeListingId={listingId}
          errorMessage={
            resolve(
              "host.editor.payment_arrangements.status_error",
              "Not saved. Check your connection and try again.",
            ).text
          }
        />
      </PaymentArrangementsTabPanel>

      <PaymentArrangementsTabPanel id="deposits" active={tab === "deposits"}>
        <DepositPoliciesEditor
          initialValue={initialDeposit}
          listingCurrency={listingCurrency}
          onSave={saveDeposit}
        />
      </PaymentArrangementsTabPanel>

      <PaymentArrangementsTabPanel id="cancellation" active={tab === "cancellation"}>
        <CancellationPolicyEditor
          initialDays={initialCancellation.freeCancellationDaysBeforeCheckIn}
          reviewedAt={initialCancellation.reviewedAt}
          onSave={saveCancellation}
        />
      </PaymentArrangementsTabPanel>
    </div>
  );
}
