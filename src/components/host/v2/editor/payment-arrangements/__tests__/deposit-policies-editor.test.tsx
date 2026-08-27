import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DepositPoliciesEditor,
  toPayload,
  type DepositPoliciesDraft,
} from "../deposit-policies-editor";
import {
  validateDepositPolicies,
  type DepositPoliciesSnapshotV2,
} from "@/lib/payments/deposit-policies";

const EDITOR_SOURCE = join(
  process.cwd(),
  "src/components/host/v2/editor/payment-arrangements/deposit-policies-editor.tsx",
);

function render(initialValue: DepositPoliciesSnapshotV2) {
  return renderToStaticMarkup(
    <DepositPoliciesEditor
      initialValue={initialValue}
      listingCurrency="EUR"
      onSave={async () => {}}
    />,
  );
}

const UNANSWERED: DepositPoliciesSnapshotV2 = {
  version: 2,
  status: "UNANSWERED",
  advancePayment: null,
  damageDeposit: null,
};

describe("deposit policies editor markup", () => {
  it("offers two independent sections rather than one purpose choice", () => {
    const html = render(UNANSWERED);

    expect(html).toContain('data-deposit-section="advance-payment"');
    expect(html).toContain('data-deposit-section="damage-deposit"');
    expect(html).toContain("Advance payment toward the booking");
    expect(html).toContain("Refundable damage deposit");
    // The V1 "Purpose" dropdown is gone for good.
    expect(html).not.toContain("Purpose");
  });

  it("explains what each kind of money is, without mixing them up", () => {
    const html = render(UNANSWERED);

    expect(html).toContain("It counts toward what the guest owes for the stay");
    expect(html).toContain("Separate from the booking price");
    // The advance-payment section says outright that it is not damage security, so a
    // host cannot read the two as the same thing under different names.
    expect(html).toContain("it is not a refundable damage deposit");
    expect(html).toContain("Security against damage that you give back to the guest");
  });

  it("keeps both sections collapsed until the host switches one on", () => {
    const html = render(UNANSWERED);

    expect(html).toContain('data-deposit-section="advance-payment" data-enabled="false"');
    expect(html).toContain('data-deposit-section="damage-deposit" data-enabled="false"');
    expect(html).not.toContain('id="advance-payment-amount-type"');
    expect(html).not.toContain('id="damage-deposit-amount-type"');
  });

  it("opens only the section a saved policy actually uses", () => {
    const html = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "PERCENTAGE",
        value: "25",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: null,
    });

    expect(html).toContain('data-deposit-section="advance-payment" data-enabled="true"');
    expect(html).toContain('data-deposit-section="damage-deposit" data-enabled="false"');
    expect(html).toContain('id="advance-payment-amount-type"');
    expect(html).not.toContain('id="damage-deposit-amount-type"');
  });

  it("shows the damage deposit's return period and the advance payment's lack of one", () => {
    const html = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "FIXED",
        value: "50",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: {
        amountType: "FIXED",
        value: "200",
        currency: "EUR",
        dueTiming: "DAYS_BEFORE_CHECK_IN",
        dueDaysBeforeCheckIn: 5,
        returnDaysAfterCheckout: 14,
      },
    });

    expect(html).toContain('id="damage-deposit-return-days"');
    expect(html).toContain("Return within days after checkout (optional)");
    expect(html).toContain('id="damage-deposit-due-days"');
    // The advance payment is due after acceptance, so it has no day count field.
    expect(html).not.toContain('id="advance-payment-due-days"');
  });
});

describe("deposit policies editor accessibility and UI consistency", () => {
  it("uses the application Select rather than a native dropdown", () => {
    const source = readFileSync(EDITOR_SOURCE, "utf8");

    expect(source).toContain('from "@/components/ui/select"');
    // No native select element or option tag anywhere in the editor.
    expect(source).not.toMatch(/<select[\s>]/);
    expect(source).not.toMatch(/<option[\s>]/);
    expect(source).not.toMatch(/<\/select>/);
  });

  it("renders each Select trigger full width, labelled and keyboard reachable", () => {
    const html = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "FIXED",
        value: "50",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: null,
    });

    // Radix renders the trigger as a real button with listbox semantics, so it is in
    // the tab order and announces its state — neither is true of a styled div.
    const triggers = html.match(/<button[^>]*data-slot="select-trigger"[^>]*>/g) ?? [];
    expect(triggers.length).toBe(2);
    for (const trigger of triggers) {
      expect(trigger).toContain('role="combobox"');
      expect(trigger).toContain("w-full");
      expect(trigger).toMatch(/aria-labelledby="[^"]+"/);
      // Nothing pulls it out of the tab order or disables it.
      expect(trigger).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(trigger).not.toMatch(/tabindex="-1"/);
    }

    // And each of those labels really exists in the markup.
    for (const id of ["advance-payment-amount-type", "advance-payment-due-timing"]) {
      expect(html).toContain(`id="${id}-label"`);
      expect(html).toContain(`aria-labelledby="${id}-label"`);
    }
  });

  it("exposes no native dropdown to the host in the rendered output", () => {
    const html = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "FIXED",
        value: "50",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: {
        amountType: "PERCENTAGE",
        value: "10",
        currency: "EUR",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: null,
      },
    });

    // Four visible controls, every one of them the application's Select trigger.
    expect(html.match(/data-slot="select-trigger"/g)).toHaveLength(4);
    expect(html).not.toMatch(/<option[\s>]/);

    // Radix mirrors each Select into a visually-hidden native <select> so browser
    // autofill still works. Those are the only ones allowed, and none of them is
    // reachable or announced — the host never sees or tabs into a native dropdown.
    const natives = html.match(/<select[^>]*>/g) ?? [];
    expect(natives).toHaveLength(4);
    for (const native of natives) {
      expect(native).toContain('aria-hidden="true"');
      expect(native).toContain('tabindex="-1"');
    }
  });
});

describe("the payload the editor sends", () => {
  const enabledAdvance = {
    enabled: true,
    amountType: "PERCENTAGE" as const,
    value: "25",
    dueTiming: "AFTER_ACCEPTANCE" as const,
    dueDaysBeforeCheckIn: null,
  };
  const enabledDamage = {
    enabled: true,
    amountType: "FIXED" as const,
    value: "200",
    dueTiming: "DAYS_BEFORE_CHECK_IN" as const,
    dueDaysBeforeCheckIn: 5,
    returnDaysAfterCheckout: 14,
  };

  it("sends only the flag for a switched-off section, hiding no stale amount", () => {
    const draft: DepositPoliciesDraft = {
      advancePayment: { ...enabledAdvance, enabled: false, value: "99" },
      damageDeposit: enabledDamage,
    };
    const payload = toPayload(draft, "EUR");

    expect(payload.advancePayment).toEqual({ enabled: false });
    expect(JSON.stringify(payload.advancePayment)).not.toContain("99");
    expect(payload.damageDeposit).toMatchObject({ enabled: true, value: "200" });
  });

  it.each([
    ["neither", false, false],
    ["advance only", true, false],
    ["damage only", false, true],
    ["both", true, true],
  ])("produces a payload the server accepts: %s", (_name, advance, damage) => {
    const payload = toPayload(
      {
        advancePayment: { ...enabledAdvance, enabled: advance },
        damageDeposit: { ...enabledDamage, enabled: damage },
      },
      "EUR",
    );
    const result = validateDepositPolicies(payload);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.advancePayment !== null).toBe(advance);
    expect(result.value.damageDeposit !== null).toBe(damage);
  });
});
