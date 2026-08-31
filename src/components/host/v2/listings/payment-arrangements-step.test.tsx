import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import type { HostStartDraftPatch } from "@/components/host/v2/listings/host-start-draft-provider";

/**
 * The payment, deposit and cancellation screen of the new-listing flow.
 *
 * Two things are being held to account here. The first is that the screen opens on the
 * safe answers *visibly* — a host who reads it knows what a guest will be told, whether
 * or not they touch anything. The second is that its CTA never fails silently: pressing
 * Continue with something unfinished names every problem, scrolls to the first one and
 * puts the cursor in it, and that last part is what the DOM stand-in below records.
 */
const draft = vi.hoisted(() => ({
  data: {} as ListingDraftData,
  patches: [] as HostStartDraftPatch[],
  saveSucceeds: true,
}));

vi.mock("@/components/host/v2/listings/host-start-draft-provider", () => ({
  useHostStartDraft: () => ({
    draftId: "draft-1",
    data: draft.data,
    save: async (patch: HostStartDraftPatch) => {
      if (!draft.saveSucceeds) return false;
      draft.patches.push(patch);
      return true;
    },
  }),
}));

const footer = vi.hoisted(() => ({
  onNext: null as (() => void | Promise<void>) | null,
  nextHref: undefined as string | undefined,
  backHref: undefined as string | undefined,
  nextLabel: undefined as string | undefined,
}));

vi.mock("@/components/host/v2/listings/listing-flow-footer", () => ({
  ListingFlowFooter: (props: {
    onNext?: () => void | Promise<void>;
    nextHref?: string;
    backHref?: string;
    nextLabel?: string;
  }) => {
    footer.onNext = props.onNext ?? null;
    footer.nextHref = props.nextHref;
    footer.backHref = props.backHref;
    footer.nextLabel = props.nextLabel;
    return null;
  },
}));

import {
  PaymentArrangementsStep,
  PaymentTermsErrorSummary,
} from "@/components/host/v2/listings/payment-arrangements-step";
import { emptyDepositPoliciesDraft } from "@/lib/host/v2/listing-deposit-draft";
import {
  CANCELLATION_ANCHOR_ID,
  CUSTOM_CANCELLATION_FIELD_ID,
  PAYMENT_METHODS_ANCHOR_ID,
} from "@/lib/host/v2/listing-payment-terms";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };
const QUERY = "propertyType=HOUSE&spaceType=ENTIRE_PLACE";

/** Where the tab was sent, and what the CTA did to the page on its way. */
const navigations: string[] = [];
const scrolledTo: string[] = [];
const focused: string[] = [];

beforeEach(() => {
  draft.data = {};
  draft.patches = [];
  draft.saveSucceeds = true;
  footer.onNext = null;
  footer.nextHref = undefined;
  footer.backHref = undefined;
  footer.nextLabel = undefined;
  navigations.length = 0;
  scrolledTo.length = 0;
  focused.length = 0;
});

/** Whether the radio with this id rendered pre-selected. Attribute order is React's
 *  to choose, so the tag is matched rather than a fixed string of attributes. */
function radioIsChecked(html: string, id: string): boolean {
  const tag = html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`No radio rendered with id ${id}`);
  return tag.includes('checked=""');
}

function step(props: { returnToReview?: boolean } = {}): string {
  return renderToStaticMarkup(
    <PaymentArrangementsStep
      propertyType={house}
      spaceType="ENTIRE_PLACE"
      {...props}
    />,
  );
}

/**
 * Runs the footer's Next against a document that reports what the step asked of it.
 *
 * Every id the step can scroll to or focus exists on the real page, so the stand-in
 * answers for all of them — a stub that returned null would let a broken target pass
 * unnoticed, which is exactly the failure this screen is meant to have stopped having.
 */
async function advance() {
  const onNext = footer.onNext;
  if (!onNext) throw new Error("Expected the step to hand the footer a Next handler");
  const previousWindow = Reflect.get(globalThis, "window") as unknown;
  const previousDocument = Reflect.get(globalThis, "document") as unknown;
  Reflect.set(globalThis, "window", {
    location: { assign: (href: string) => navigations.push(href) },
  });
  Reflect.set(globalThis, "document", {
    getElementById: (id: string) => ({
      scrollIntoView: () => scrolledTo.push(id),
      focus: () => focused.push(id),
    }),
  });
  try {
    await onNext();
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", previousWindow);
    if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document");
    else Reflect.set(globalThis, "document", previousDocument);
  }
}

// ─── What the screen says before anyone touches it ───────────────────────────────

describe("a fresh draft", () => {
  it("states all four terms in the summary at the top", () => {
    const html = step();

    expect(html).toContain("Your payment terms");
    expect(html).toContain("Accepted payment method");
    expect(html).toContain("Not chosen yet");
    expect(html).toContain("Advance payment");
    expect(html).toContain("Damage deposit");
    expect(html).toContain("Free cancellation deadline");
    expect(html).toContain("Until check-in begins");
    // Two "Not required" values in the summary, plus one per deposit choice card.
    expect((html.match(/Not required/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("opens on the safe answers, selected rather than merely empty", () => {
    const html = step();

    expect(radioIsChecked(html, "advance-payment-choice-off")).toBe(true);
    expect(radioIsChecked(html, "advance-payment-choice-on")).toBe(false);
    expect(radioIsChecked(html, "damage-deposit-choice-off")).toBe(true);
    expect(radioIsChecked(html, "damage-deposit-choice-on")).toBe(false);
    expect(radioIsChecked(html, "cancellation-choice-0")).toBe(true);
    // Exactly those three: no advance, no deposit, refund until check-in.
    expect((html.match(/checked=""/g) ?? []).length).toBe(3);
    expect(html).toContain('data-deposit-section="advance-payment-choice" data-enabled="false"');
    expect(html).toContain('data-deposit-section="damage-deposit-choice" data-enabled="false"');
  });

  it("says nothing red before the host has been asked anything", () => {
    const html = step();

    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Choose at least one way guests can pay.");
    expect(html).not.toContain("Finish this before you continue");
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("hides the money fields until a deposit is actually asked for", () => {
    const html = step();

    expect(html).not.toContain('id="advance-payment-value"');
    expect(html).not.toContain('id="damage-deposit-value"');
    expect(html).not.toContain('id="damage-deposit-return-days"');
  });

  it("offers the cancellation deadline as choices with their consequences", () => {
    const html = step();

    expect(html).toContain('id="cancellation-choice-0"');
    expect(html).toContain('id="cancellation-choice-3"');
    expect(html).toContain('id="cancellation-choice-7"');
    expect(html).toContain('id="cancellation-choice-14"');
    expect(html).toContain('id="cancellation-choice-custom"');
    expect(html).toContain(
      "Guests can cancel for a full refund until check-in begins.",
    );
    expect(html).toContain(
      "Guests can cancel for a full refund until 7 days before check-in.",
    );
    // The number field belongs to the custom card alone.
    expect(html).not.toContain(`id="${CUSTOM_CANCELLATION_FIELD_ID}"`);
  });

  it("gives every block the anchor the CTA scrolls to", () => {
    const html = step();

    expect(html).toContain(`id="${PAYMENT_METHODS_ANCHOR_ID}"`);
    expect(html).toContain(`id="${CANCELLATION_ANCHOR_ID}"`);
  });
});

describe("what an existing draft brings back", () => {
  it("shows a saved advance payment with its amount and timing open", () => {
    const depositPolicies = emptyDepositPoliciesDraft();
    depositPolicies.currency = "EUR";
    depositPolicies.advancePayment = {
      enabled: true,
      amountType: "PERCENTAGE",
      value: "20",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
    };
    draft.data = {
      acceptedPaymentMethods: ["PAYPAL"],
      currency: "EUR",
      depositPolicies,
    } as ListingDraftData;
    const withAnswer = step();

    expect(withAnswer).toContain('data-deposit-section="advance-payment-choice" data-enabled="true"');
    expect(withAnswer).toContain('id="advance-payment-value"');
    expect(withAnswer).toContain('value="20"');
    // The summary follows the answer, not the default.
    expect(withAnswer).toContain("Required");
  });

  it("shows a saved deadline as its own selected card", () => {
    draft.data = {
      acceptedPaymentMethods: ["PAYPAL"],
      freeCancellationDaysBeforeCheckIn: "14",
    } as ListingDraftData;
    const html = step();

    expect(radioIsChecked(html, "cancellation-choice-14")).toBe(true);
    expect(radioIsChecked(html, "cancellation-choice-0")).toBe(false);
    expect(html).toContain("14 days before check-in");
  });

  it("puts a saved off-preset deadline into the custom field, open", () => {
    draft.data = {
      acceptedPaymentMethods: ["PAYPAL"],
      freeCancellationDaysBeforeCheckIn: "30",
    } as ListingDraftData;
    const html = step();

    expect(radioIsChecked(html, "cancellation-choice-custom")).toBe(true);
    expect(html).toContain(`id="${CUSTOM_CANCELLATION_FIELD_ID}"`);
    expect(html).toContain('value="30"');
  });

  it("keeps a saved amount and says the currency moved rather than resetting it", () => {
    const depositPolicies = emptyDepositPoliciesDraft();
    depositPolicies.currency = "EUR";
    depositPolicies.advancePayment = {
      enabled: true,
      amountType: "FIXED",
      value: "100",
      dueTiming: "AT_CHECK_IN",
      dueDaysBeforeCheckIn: null,
    };
    draft.data = {
      acceptedPaymentMethods: ["PAYPAL"],
      currency: "MKD",
      depositPolicies,
    } as ListingDraftData;
    const html = step();

    expect(html).toContain('value="100"');
    expect(html).toContain("This listing now prices in MKD.");
  });
});

// ─── Optional details ────────────────────────────────────────────────────────────

describe("private payment details", () => {
  it("never calls an optional field missing", () => {
    draft.data = { acceptedPaymentMethods: ["PAYPAL"] } as ListingDraftData;
    const html = step();

    expect(html).toContain("Optional");
    expect(html).not.toContain("Missing details");
    // Nor does a method with nothing entered read as something the host must fix.
    expect(html).not.toContain("Needs attention");
  });

  it("does not stand between the host and the next screen", async () => {
    draft.data = { acceptedPaymentMethods: ["PAYPAL"] } as ListingDraftData;
    step();

    expect(footer.nextHref).toBe(`/host/start/availability?${QUERY}`);
    await advance();

    expect(draft.patches).toHaveLength(1);
    expect(navigations).toEqual([`/host/start/availability?${QUERY}`]);
  });

  it("lets cash stand on its own with no guest note attached", async () => {
    draft.data = { acceptedPaymentMethods: ["CASH_AT_PROPERTY"] } as ListingDraftData;
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({
      acceptedPaymentMethods: ["CASH_AT_PROPERTY"],
    });
    expect(navigations).toHaveLength(1);
  });

  it("lets arrange directly stand on its own", async () => {
    draft.data = { acceptedPaymentMethods: ["ARRANGE_DIRECTLY"] } as ListingDraftData;
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({
      acceptedPaymentMethods: ["ARRANGE_DIRECTLY"],
    });
  });
});

// ─── The CTA ─────────────────────────────────────────────────────────────────────

describe("pressing Continue with the one required answer missing", () => {
  beforeEach(() => {
    draft.data = {} as ListingDraftData;
  });

  it("keeps the CTA live rather than letting it do nothing", async () => {
    step();

    // No href, so it cannot navigate — but the handler is there, which is the whole
    // difference between a screen that explains itself and one that looks broken.
    expect(footer.nextHref).toBeUndefined();
    expect(footer.onNext).not.toBeNull();
    await advance();

    expect(draft.patches).toEqual([]);
    expect(navigations).toEqual([]);
  });

  it("scrolls to the methods block and focuses the first checkbox", async () => {
    step();

    await advance();

    expect(scrolledTo).toEqual([PAYMENT_METHODS_ANCHOR_ID]);
    expect(focused).toEqual(["payment-method-cash-at-property"]);
  });

  it("sends the host to the deadline field when that is the first problem", async () => {
    draft.data = {
      acceptedPaymentMethods: ["PAYPAL"],
      freeCancellationDaysBeforeCheckIn: "9999",
    } as ListingDraftData;
    step();

    await advance();

    expect(scrolledTo).toEqual([CANCELLATION_ANCHOR_ID]);
    expect(focused).toEqual([CUSTOM_CANCELLATION_FIELD_ID]);
  });
});

describe("a save that fails", () => {
  it("keeps the host here with everything they entered", async () => {
    draft.saveSucceeds = false;
    draft.data = {
      acceptedPaymentMethods: ["PAYPAL"],
      freeCancellationDaysBeforeCheckIn: "7",
    } as ListingDraftData;
    step();

    await advance();

    expect(navigations).toEqual([]);
    // Nothing was scrolled or focused away from: the answers are all still on screen,
    // and the summary is what moves.
    expect(scrolledTo).toEqual([]);
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────────

describe("moving around the flow", () => {
  it("goes back to Price in sequence", () => {
    step();

    expect(footer.backHref).toBe(`/host/start/price?${QUERY}`);
    expect(footer.nextLabel).toBe("Next");
  });

  it("returns to Review when it was reached from there", async () => {
    draft.data = { acceptedPaymentMethods: ["PAYPAL"] } as ListingDraftData;
    step({ returnToReview: true });

    expect(footer.backHref).toBe(`/host/start/review?${QUERY}`);
    expect(footer.nextLabel).toBe("Save and review");

    await advance();

    // The answer is still written on the way back: Review is a summary of the draft.
    expect(draft.patches[0]).toMatchObject({ currentRoute: "review" });
    expect(navigations).toEqual([`/host/start/review?${QUERY}`]);
  });
});

// ─── The error summary ───────────────────────────────────────────────────────────

describe("the error summary", () => {
  const goTo = () => undefined;

  it("names every problem in one alert", () => {
    const html = renderToStaticMarkup(
      <PaymentTermsErrorSummary
        saveFailed={false}
        onGoTo={goTo}
        issues={[
          {
            code: "PAYMENT_METHOD_REQUIRED",
            anchorId: PAYMENT_METHODS_ANCHOR_ID,
            focusId: "payment-method-cash-at-property",
          },
          {
            code: "CANCELLATION_INVALID",
            anchorId: CANCELLATION_ANCHOR_ID,
            focusId: CUSTOM_CANCELLATION_FIELD_ID,
          },
        ]}
      />,
    );

    expect(html).toContain("Finish this before you continue");
    expect(html).toContain("Choose at least one way guests can pay.");
    expect(html).toContain("Enter a whole number of days from 0 to 3650.");
    // Exactly one live region for the screen: four of them announce the same refusal
    // four times and leave a screen-reader user assembling it from fragments.
    expect((html.match(/role="alert"/g) ?? []).length).toBe(1);
    // Each entry is a control, so the fix is one press away from the keyboard too.
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it("takes the cursor, so the announcement has somewhere to land", () => {
    const html = renderToStaticMarkup(
      <PaymentTermsErrorSummary saveFailed onGoTo={goTo} issues={[]} />,
    );

    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('id="payment-terms-error-summary"');
  });

  it("says a failed save lost nothing and can be retried", () => {
    const html = renderToStaticMarkup(
      <PaymentTermsErrorSummary saveFailed onGoTo={goTo} issues={[]} />,
    );

    expect(html).toContain("Your answers were not saved");
    expect(html).toContain(
      "Nothing you entered was lost. Check your connection and try again.",
    );
  });
});

// ─── Layout ──────────────────────────────────────────────────────────────────────

describe("layout", () => {
  it("clears the sticky footer at every width", () => {
    const html = step();

    // The footer is fixed to the bottom; the extra padding on narrow screens is what
    // keeps the last card and its error text above it.
    expect(html).toContain("pb-40 pt-4 md:px-8 md:pb-32");
  });

  it("stacks the choice cards on a phone and pairs them from the small breakpoint", () => {
    const html = step();

    expect(html).toContain("grid gap-2 sm:grid-cols-2");
    expect(html).toContain("mt-3 grid gap-3 sm:grid-cols-2");
  });
});
