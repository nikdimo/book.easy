import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The picker asks the server which of the host's other listings have a payment answer.
// There is no host and no database here, so it is stubbed with "none" — which is also
// the state in which the picker renders nothing and leaves this markup untouched.
vi.mock("@/lib/actions/listing-payment-copy.actions", () => ({
  listPaymentCopySourcesAction: async () => ({ sources: [] }),
  loadPaymentCopyPayloadAction: async () => ({ error: "Listing not found." }),
}));
import { CancellationPolicyEditor } from "./cancellation-policy-editor";
import { DepositPoliciesEditor } from "./deposit-policies-editor";
import { PaymentArrangementsEditor } from "./payment-arrangements-editor";
import type { DepositPoliciesSnapshotV2 } from "@/lib/payments/deposit-policies";

function renderCancellation(
  initialDays: number | null,
  reviewedAt: string | null = null,
) {
  return renderToStaticMarkup(
    <CancellationPolicyEditor
      initialDays={initialDays}
      reviewedAt={reviewedAt}
      onSave={async () => {}}
    />,
  );
}

const UNANSWERED_DEPOSITS: DepositPoliciesSnapshotV2 = {
  version: 2,
  status: "UNANSWERED",
  advancePayment: null,
  damageDeposit: null,
};

describe("cancellation policy editor", () => {
  it("keeps its own labelled field, hint and consequence line", () => {
    const html = renderCancellation(14, "2026-08-24T10:00:00.000Z");

    expect(html).toContain('for="listing-free-cancellation-days"');
    expect(html).toContain('id="listing-free-cancellation-days"');
    expect(html).toContain('value="14"');
    expect(html).toContain('max="3650"');
    expect(html).toContain(
      "you may keep only an advance payment already received",
    );
  });

  it("distinguishes a saved policy from one that has never been answered", () => {
    expect(renderCancellation(7, "2026-08-24T10:00:00.000Z")).toContain(
      "Cancellation policy saved",
    );
    expect(renderCancellation(null)).toContain("Cancellation policy needs review");
    // 0 is the most generous real answer, not a blank one, and must not read as unset.
    expect(renderCancellation(0, "2026-08-24T10:00:00.000Z")).toContain('value="0"');
  });

  it("keeps its own submit button, tied to its own server action", () => {
    const html = renderCancellation(7, "2026-08-24T10:00:00.000Z");

    expect(html).toContain("Save cancellation policy");
    expect((html.match(/type="submit"/g) ?? []).length).toBe(1);
  });
});

describe("the page's three saves stay three saves", () => {
  // Payment methods, deposits and cancellation are three server actions against three
  // persistence boundaries. One combined button could commit one and lose another while
  // telling the host everything was saved, so the redesign made them quiet and
  // identical rather than merging them.
  const methods = renderToStaticMarkup(
    <PaymentArrangementsEditor
      initialValue={{
        methodCodes: ["CASH_AT_PROPERTY"],
        otherLabel: null,
        reviewedAt: "2026-08-24T10:00:00.000Z",
      }}
      onSave={async () => {}}
    />,
  );
  const deposits = renderToStaticMarkup(
    <DepositPoliciesEditor
      initialValue={UNANSWERED_DEPOSITS}
      listingCurrency="EUR"
      onSave={async () => {}}
    />,
  );
  const cancellation = renderCancellation(7, "2026-08-24T10:00:00.000Z");

  it.each([
    ["payment methods", () => methods, "Save payment methods"],
    ["deposits", () => deposits, "Save deposit settings"],
    ["cancellation", () => cancellation, "Save cancellation policy"],
  ])("gives %s exactly one submit, named for its own section", (_name, html, label) => {
    expect(html()).toContain(label);
    expect((html().match(/type="submit"/g) ?? []).length).toBe(1);
  });

  it.each([
    ["payment methods", () => methods],
    ["deposits", () => deposits],
    ["cancellation", () => cancellation],
  ])("reports %s status in a polite live region", (_name, html) => {
    expect(html()).toContain('role="status"');
    expect(html()).toContain('aria-live="polite"');
  });

  it("uses one button treatment for all three, so none outranks the others", () => {
    for (const html of [methods, deposits, cancellation]) {
      expect(html).toContain("rounded-full bg-slate-900 px-5");
    }
  });

  it("separates each save from its section with a rule, not with a bar", () => {
    for (const html of [methods, deposits, cancellation]) {
      expect(html).toContain("border-t border-slate-100 pt-5");
      // Nothing sticky, so no action area can cover the last field of a section.
      expect(html).not.toContain("sticky");
      expect(html).not.toContain("fixed bottom");
    }
  });
});
