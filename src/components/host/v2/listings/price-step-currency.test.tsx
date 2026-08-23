import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import type { HostStartDraftPatch } from "@/components/host/v2/listings/host-start-draft-provider";

/**
 * The draft the step reads, and every patch it writes back. Kept mutable so a test can
 * seed an imported draft — a listing that arrived priced in USD — before rendering.
 */
const draft = vi.hoisted(() => ({
  data: {} as ListingDraftData,
  patches: [] as HostStartDraftPatch[],
}));

vi.mock("@/components/host/v2/listings/host-start-draft-provider", () => ({
  useHostStartDraft: () => ({
    draftId: "draft-1",
    data: draft.data,
    save: async (patch: HostStartDraftPatch) => {
      draft.patches.push(patch);
      return true;
    },
  }),
}));

/**
 * The footer is where "Next" lives, and a static render never clicks it. Standing in
 * for it captures the handler so the test can run the same advance the host would.
 */
const footer = vi.hoisted(() => ({ onNext: null as (() => void | Promise<void>) | null }));

vi.mock("@/components/host/v2/listings/listing-flow-footer", () => ({
  ListingFlowFooter: (props: { onNext?: () => void | Promise<void> }) => {
    footer.onNext = props.onNext ?? null;
    return null;
  },
}));

import { PriceStep } from "@/components/host/v2/listings/price-step";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

function step(props: Partial<Parameters<typeof PriceStep>[0]> = {}): string {
  return renderToStaticMarkup(
    <PriceStep
      propertyType={house}
      spaceType="ENTIRE_PLACE"
      currency={DEFAULT_CURRENCY}
      {...props}
    />,
  );
}

beforeEach(() => {
  draft.data = {};
  draft.patches = [];
  footer.onNext = null;
});

describe("PriceStep — the draft's own currency", () => {
  it("prices an imported USD draft in USD, not in the flow's default", () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };

    // Reading the site in USD too, so the currency-mismatch notice — which names both
    // currencies by design — is not what this assertion is looking at.
    const html = step({ displayCurrency: "USD" });

    expect(html).toContain("USD");
    expect(html).toContain("US Dollar");
    expect(html).toContain("$");
    expect(html).toContain("A 3-night stay costs $360.00.");
    expect(html).not.toContain("EUR");
    expect(html).not.toContain("€");
    expect(html).not.toContain("Euro");
  });

  it("leaves the amount alone — the currency is relabelled, never converted", () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };

    expect(step()).toContain('value="120"');
  });

  it("still uses the default for a new draft that carries no currency", () => {
    const html = step();

    expect(html).toContain("EUR");
    expect(html).toContain("Euro");
    expect(html).toContain("€");
    expect(html).not.toContain("USD");
  });

  it("saves the draft's currency when the host advances, not the default", async () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };
    step();

    await advance();

    expect(draft.patches).toEqual([
      { baseNightlyRate: "120", cleaningFee: "0", currency: "USD", currentStepId: "specialOffer" },
    ]);
  });

  it("saves the default when a new draft has never carried a currency", async () => {
    step({ initialPrice: "90" });

    await advance();

    expect(draft.patches).toEqual([
      {
        baseNightlyRate: "90",
        cleaningFee: "0",
        currency: DEFAULT_CURRENCY,
        currentStepId: "specialOffer",
      },
    ]);
  });
});

/** Runs the footer's "Next", with a stand-in for the navigation it ends in. */
async function advance() {
  const onNext = footer.onNext;
  if (!onNext) throw new Error("Expected the step to hand the footer a Next handler");
  const previous = Reflect.get(globalThis, "window") as unknown;
  Reflect.set(globalThis, "window", { location: { assign: () => {} } });
  try {
    await onNext();
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", previous);
  }
}

describe("PriceStep — the cleaning fee", () => {
  it("starts switched off, with no field on screen and the offer explained", () => {
    const html = step();

    expect(html).toContain("Charge a cleaning fee");
    expect(html).toContain("Charged once per stay, not per night.");
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('id="listing-flow-cleaning-fee"');
  });

  it("shows the field, switched on, for a draft that already charges one", () => {
    draft.data = { baseNightlyRate: "60", cleaningFee: "15" };

    const html = step();

    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('id="listing-flow-cleaning-fee"');
  });

  it("asks for the amount rather than inventing one when the switch is on", () => {
    // An invented nightly rate sits in the open and gets overwritten; an invented fee
    // would be charged on every booking without being noticed.
    const html = step({
      initialPrice: "60",
      initialFeeOn: true,
      initialTouched: true,
    });

    expect(html).toContain("Enter a cleaning fee, or turn it off.");
    expect(html).not.toContain("/host/start/availability");
    expect(html).not.toContain("A 3-night stay costs");
  });

  it("saves nothing for the fee while the switch is off", async () => {
    draft.data = { baseNightlyRate: "60" };
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({
      baseNightlyRate: "60",
      cleaningFee: "0",
    });
  });

  it("restores the fee a draft already carries", () => {
    draft.data = { baseNightlyRate: "60", cleaningFee: "15" };

    expect(step()).toContain('value="15"');
  });

  it("prices the example stay with the fee added exactly once", () => {
    draft.data = { baseNightlyRate: "60", cleaningFee: "15" };

    // 60 x 3 nights + 15 once.
    expect(step()).toContain("A 3-night stay costs €195.00.");
  });

  it("saves the fee alongside the nightly rate", async () => {
    draft.data = { baseNightlyRate: "60", cleaningFee: "15" };
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({ baseNightlyRate: "60", cleaningFee: "15" });
  });

  it("stores a cleared field as no fee rather than leaving a stale one behind", async () => {
    draft.data = { baseNightlyRate: "60", cleaningFee: "" };
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({ cleaningFee: "0" });
  });

  it("neither saves nor navigates on a fee above the ceiling", async () => {
    draft.data = { baseNightlyRate: "60", cleaningFee: "9999" };
    step();

    await advance();

    expect(draft.patches).toEqual([]);
  });

  it("shows the ceiling error against the field once Next has been pressed", () => {
    draft.data = { baseNightlyRate: "60", cleaningFee: "9999" };

    const html = step({ initialTouched: true });

    expect(html).toContain("Your cleaning fee can be at most €1,000.00.");
    expect(html).not.toContain("A 3-night stay costs");
  });
});

describe("PriceStep — the amount fields", () => {
  it("is typed rather than nudged: counts get steppers in this flow, money does not", () => {
    const html = step({ initialPrice: "60" });

    expect(html).toContain('id="listing-flow-price"');
    expect(html).not.toContain('aria-label="Lower the nightly price"');
    expect(html).not.toContain('aria-label="Raise the nightly price"');
  });

  it("keeps the currency beside each amount it belongs to", () => {
    const html = step({ initialPrice: "60", initialCleaningFee: "15" });

    // One for the price, one for the fee, one for the "Prices in" line.
    expect(html.split("€").length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe("PriceStep — how pricing works", () => {
  it("keeps the explanation behind one control instead of on the screen", () => {
    const html = step();

    expect(html).toContain("How pricing works");
    // The prose itself is not in the closed state.
    expect(html).not.toContain("This is your base price");
    expect(html).not.toContain('role="dialog"');
  });

  it("explains the base price, the calendar and the fee once opened", () => {
    const html = step({ initialInfoOpen: true });

    expect(html).toContain('role="dialog"');
    expect(html).toContain("This is your base price");
    expect(html).toContain("your calendar is where the rest happens");
    expect(html).toContain("added once to every booking");
  });
});

/**
 * What happens when the host changes their display currency partway through creating a
 * listing. The one outcome that must never occur is the silent relabel: the number the
 * host typed keeping its value while the currency beside it changes.
 */
const RATES = { EUR: 1, DKK: 7.46, USD: 1.08 } as const;

describe("PriceStep — a currency change during an unfinished draft", () => {
  it("does not touch the amount or the currency on its own", () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };

    const html = step({ displayCurrency: "EUR", rates: RATES });

    // Still 120, still dollars — the notice offers, it does not act.
    expect(html).toContain('value="120"');
    expect(html).toContain("Prices in USD");
    expect(html).toContain("A 3-night stay costs $360.00.");
  });

  it("says which currency the listing is in and which the host is browsing in", () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };

    expect(step({ displayCurrency: "EUR", rates: RATES })).toContain(
      "This listing is priced in USD, but you are browsing in EUR.",
    );
  });

  it("offers a conversion when rates can price the amount in the new currency", () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };

    const html = step({ displayCurrency: "EUR", rates: RATES });

    expect(html).toContain("Convert to EUR");
    expect(html).toContain("Keep USD");
    expect(html).not.toContain("Clear and switch");
  });

  it("offers to clear instead when there are no rates to convert with", () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };

    const html = step({ displayCurrency: "EUR", rates: null });

    expect(html).toContain("Clear and switch to EUR");
    expect(html).toContain("Keep USD");
    expect(html).not.toContain("Convert to EUR");
  });

  it("still saves the draft's own currency when the host ignores the offer", async () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };
    step({ displayCurrency: "EUR", rates: RATES });

    await advance();

    expect(draft.patches).toEqual([
      { baseNightlyRate: "120", cleaningFee: "0", currency: "USD", currentStepId: "specialOffer" },
    ]);
  });

  it("says nothing at all when the listing is already in the host's currency", () => {
    draft.data = { currency: "EUR", baseNightlyRate: "120" };

    expect(step({ displayCurrency: "EUR", rates: RATES })).not.toContain(
      "but you are browsing in",
    );
  });

  it("does not pester a brand-new draft, which was seeded with the host's currency", () => {
    draft.data = {};

    expect(step({ displayCurrency: "EUR", currency: "EUR", rates: RATES })).not.toContain(
      "but you are browsing in",
    );
  });
});
