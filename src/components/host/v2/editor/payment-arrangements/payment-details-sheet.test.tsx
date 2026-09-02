import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaymentDetailsSheet } from "./payment-details-sheet";
import {
  draftAfterMethodToggle,
  drawerAfterMethodToggle,
  paymentDetailIssues,
  type PaymentArrangementsDraft,
  type PaymentMethodCode,
} from "./payment-arrangements-model";

const BANK_TITLE = ["International", "bank", "transfer"].join(" ");
const BITCOIN_TITLE = "Bitcoin";

const SHEET_PANEL_SOURCE = join(process.cwd(), "src/components/host/v2/sheet-panel.tsx");

const BANK_DETAILS = {
  accountHolder: "Nikola Dimovski",
  bankName: "Komercijalna Banka",
  accountIdentifier: "DK5000400440116243",
  swiftBic: "DABADKKK",
};

/**
 * The drawer, for one method, against a draft the editor owns.
 *
 * The props are the ones the editor really passes, so these exercise the wiring rather
 * than a convenient stand-in.
 */
function renderSheet(
  code: PaymentMethodCode | null,
  draft: PaymentArrangementsDraft,
  overrides: Partial<React.ComponentProps<typeof PaymentDetailsSheet>> = {},
) {
  const legacyText = code
    ? (draft.instructionTemplates?.[code]?.trim() ?? "")
    : "";
  return renderToStaticMarkup(
    <PaymentDetailsSheet
      code={code}
      draft={draft}
      issues={code ? paymentDetailIssues(draft)[code] : undefined}
      legacyText={legacyText}
      showLegacy={Boolean(legacyText)}
      disabled={false}
      title={BANK_TITLE}
      onClose={vi.fn()}
      onFieldChange={vi.fn()}
      onConvert={vi.fn()}
      {...overrides}
    />,
  );
}

describe("selecting a method and opening its details are separate acts", () => {
  it("leaves the drawer alone when a method is ticked", () => {
    // Ticking four methods in a row must cost four ticks, not four dismissals — and it
    // must not move focus off the row the host is working down.
    expect(drawerAfterMethodToggle(null, "PAYPAL", true)).toBeNull();
    expect(drawerAfterMethodToggle(null, "BANK_TRANSFER_INTERNATIONAL", true)).toBeNull();
    // Nor does it steal a drawer already open for another method.
    expect(drawerAfterMethodToggle("WISE", "PAYPAL", true)).toBe("WISE");
  });

  it("closes the drawer only for the method that was just cleared", () => {
    expect(drawerAfterMethodToggle("PAYPAL", "PAYPAL", false)).toBeNull();
    expect(drawerAfterMethodToggle("PAYPAL", "WISE", false)).toBe("PAYPAL");
  });

  it("can only ever have one drawer open, because there is one place to say so", () => {
    // The open method is a single code, not a set: "two open" is unrepresentable.
    const html = renderSheet("PAYPAL", { methodCodes: ["PAYPAL"], otherLabel: null });
    expect(html.match(/role="dialog"/g)).toHaveLength(1);
    // A closed drawer renders nothing at all, so nothing of it is left on the page.
    expect(renderSheet(null, { methodCodes: ["PAYPAL"], otherLabel: null })).toBe("");
  });

  it("keeps half-entered text when a method is switched off and back on", () => {
    const draft: PaymentArrangementsDraft = {
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
      otherLabel: null,
      details: { BANK_TRANSFER_INTERNATIONAL: { accountHolder: "Nikola D" } },
    };

    const off = draftAfterMethodToggle(draft, "BANK_TRANSFER_INTERNATIONAL", false);
    expect(off.methodCodes).toEqual([]);
    // Still there while the host is deciding. The save normalizer is what finally drops
    // details for a method that stays unselected — a mis-click must not destroy typing.
    expect(off.details?.BANK_TRANSFER_INTERNATIONAL).toEqual({
      accountHolder: "Nikola D",
    });

    const back = draftAfterMethodToggle(off, "BANK_TRANSFER_INTERNATIONAL", true);
    expect(back.methodCodes).toEqual(["BANK_TRANSFER_INTERNATIONAL"]);
    expect(back.details?.BANK_TRANSFER_INTERNATIONAL).toEqual({
      accountHolder: "Nikola D",
    });
  });

  it("keeps ARRANGE_DIRECTLY exclusive through the same transition", () => {
    expect(
      draftAfterMethodToggle(
        { methodCodes: ["CASH_AT_PROPERTY", "PAYPAL"], otherLabel: null },
        "ARRANGE_DIRECTLY",
        true,
      ).methodCodes,
    ).toEqual(["ARRANGE_DIRECTLY"]);
  });

  it("clears the OTHER label only once OTHER is no longer selected", () => {
    const withOther: PaymentArrangementsDraft = {
      methodCodes: ["OTHER"],
      otherLabel: "MobilePay",
    };
    expect(draftAfterMethodToggle(withOther, "CASH_AT_PROPERTY", true).otherLabel).toBe(
      "MobilePay",
    );
    expect(draftAfterMethodToggle(withOther, "OTHER", false).otherLabel).toBeNull();
  });
});

describe("the payment details drawer", () => {
  const draft: PaymentArrangementsDraft = {
    methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
    otherLabel: null,
    details: { BANK_TRANSFER_INTERNATIONAL: BANK_DETAILS },
  };

  it("is a named modal dialog carrying the method's own title", () => {
    const html = renderSheet("BANK_TRANSFER_INTERNATIONAL", draft);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    // "Details" alone would not say whose. The title is the method.
    expect(html).toContain(BANK_TITLE);
    expect(html).toContain("Only shared with a guest after you accept their booking.");
  });

  it("closes on Done rather than claiming to save anything", () => {
    const html = renderSheet("BANK_TRANSFER_INTERNATIONAL", draft);

    expect(html).toContain(">Done</button>");
    // Nothing in the drawer writes to the server, so nothing in it may say "Save".
    expect(html).not.toContain("Save payment methods");
    expect(html).not.toMatch(/>\s*Save\b/);
  });

  it("renders the shared PaymentDetailFields against the editor's draft", () => {
    const html = renderSheet("BANK_TRANSFER_INTERNATIONAL", draft);

    expect(html).toContain('id="payment-field-bank-transfer-international-accountHolder"');
    expect(html).toContain("IBAN or account number");
    // Values show as typed inside the drawer — nobody can proofread a masked IBAN.
    expect(html).toContain('value="DK5000400440116243"');
    expect(html).toContain('value="Nikola Dimovski"');
  });

  it("holds no values of its own, so closing and reopening cannot lose any", () => {
    const halfEntered: PaymentArrangementsDraft = {
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
      otherLabel: null,
      details: { BANK_TRANSFER_INTERNATIONAL: { accountIdentifier: "DK50004004" } },
    };

    // Two independent mounts — which is exactly what closing and reopening is, since
    // the panel unmounts while closed — read the same values back out of the draft.
    expect(renderSheet("BANK_TRANSFER_INTERNATIONAL", halfEntered)).toContain(
      'value="DK50004004"',
    );
    expect(renderSheet("BANK_TRANSFER_INTERNATIONAL", halfEntered)).toContain(
      'value="DK50004004"',
    );
    // A half-entered value is not an error while the host is still typing into it.
    expect(renderSheet("BANK_TRANSFER_INTERNATIONAL", halfEntered)).not.toContain(
      "fails its check digits",
    );
  });

  it("reports an invalid value inside the drawer, next to the field", () => {
    const broken: PaymentArrangementsDraft = {
      methodCodes: ["BITCOIN"],
      otherLabel: null,
      details: {
        BITCOIN: { network: "BITCOIN", walletAddress: "Seed phrase: one two three" },
      },
    };
    const html = renderSheet("BITCOIN", broken, { title: BITCOIN_TITLE });

    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]*-error"/);
    expect(html).toContain("not a valid address for the network you chose");
  });

  it("offers a legacy paragraph for deliberate conversion instead of parsing it", () => {
    const legacy: PaymentArrangementsDraft = {
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
      otherLabel: null,
      instructionTemplates: {
        BANK_TRANSFER_INTERNATIONAL: "IBAN DK5000400440116243 SWIFT DABADKKK",
      },
    };
    const html = renderSheet("BANK_TRANSFER_INTERNATIONAL", legacy);

    expect(html).toContain("Legacy saved instructions");
    expect(html).toContain("Convert to structured fields");
    // Shown verbatim, never split across the structured fields. Pattern-matching a
    // paragraph into an IBAN and a SWIFT code is how money reaches the wrong account.
    expect(html).toContain("IBAN DK5000400440116243 SWIFT DABADKKK");
    expect(html).not.toContain('value="DK5000400440116243"');
  });

  it("keeps the old text in place until the converted fields are saved", () => {
    const converting: PaymentArrangementsDraft = {
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
      otherLabel: null,
      instructionTemplates: { BANK_TRANSFER_INTERNATIONAL: "IBAN DK5000400440116243" },
    };
    const html = renderSheet("BANK_TRANSFER_INTERNATIONAL", converting, {
      showLegacy: false,
    });

    expect(html).toContain(
      "Your previous saved text is still in place. It is replaced only when you save these fields.",
    );
    expect(html).toContain("IBAN or account number");
  });

  it("stacks its fields, because the drawer is narrow whatever the window is", () => {
    // `sm:grid-cols-2` is a viewport query and cannot see a 448px drawer.
    expect(renderSheet("BANK_TRANSFER_INTERNATIONAL", draft)).not.toContain(
      "sm:grid-cols-2",
    );
  });
});

describe("the drawer's dialog behaviour", () => {
  // The node test environment has no DOM, so what is asserted here is the wiring the
  // shared panel commits to. The behaviour itself belongs to `SheetPanel`, which every
  // sheet in the host flow already uses and which this section did not re-implement.
  const source = readFileSync(SHEET_PANEL_SOURCE, "utf8");

  it("dismisses on Escape and on a press that starts and ends on the scrim", () => {
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain(
      "if (event.target === event.currentTarget) onCloseRef.current();",
    );
  });

  it("does not re-run its focus trap when the parent re-renders", () => {
    // The trap's teardown returns focus to the trigger. Depending on the caller's
    // inline `onClose` made every keystroke in a field tear it down and set it up
    // again, which threw focus out of the field after one character.
    expect(source).toContain("const onCloseRef = useRef(onClose);");
    expect(source).toContain("}, [open]);");
  });

  it("traps Tab inside the panel in both directions", () => {
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain(
      "event.shiftKey && (active === first || !panel.contains(active))",
    );
  });

  it("locks the page behind it and restores what it found", () => {
    expect(source).toContain('body.style.overflow = "hidden"');
    expect(source).toContain("body.style.overflow = previousOverflow;");
  });

  it("takes focus on open and gives it back to the trigger on close", () => {
    expect(source).toContain("panelRef.current?.focus();");
    expect(source).toContain("trigger?.focus();");
  });

  it("scrolls in one container, so a short viewport has no nested scrollbar", () => {
    // The panel is the scroller and the footer sits inside it, which is also why the
    // Done button can never park itself over the last field.
    expect(source.match(/overflow-y-auto/g)).toHaveLength(1);
  });

  it("keeps the side variant opt-in and at a practical desktop width", () => {
    // Every sheet that existed before this variant keeps the centred panel it had.
    expect(source).toContain('variant = "center"');
    expect(source).toContain("md:w-[28rem]");
    expect(source).toContain("md:max-w-[min(100vw,30rem)]");
  });

  it("is still the same bottom sheet on a phone", () => {
    // The side drawer starts at `md`. Below it, both variants rise from the bottom
    // edge, which is the shape this content already wanted on a phone.
    expect(source).toContain("fixed inset-0 z-50 flex items-end justify-center");
    expect(source).toContain("rounded-t-[2rem]");
  });
});
