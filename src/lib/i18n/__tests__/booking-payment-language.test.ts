import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import catalog from "../generated-ui-strings.json";
import { EMAIL_CATALOG } from "@/lib/email/i18n/catalog";
import { getEmailT } from "@/lib/email/i18n";

/**
 * Linger Homes takes no booking money. It never charges a guest, holds nothing,
 * refunds nothing and pays no host out: a request goes to the host, and if the host
 * accepts, the two of them arrange payment between themselves.
 *
 * Every sentence the product used to say about payment was written for a platform
 * that does. This file is the guard that they do not come back — the catalog is the
 * single place every translated string in the app has to pass through, so a
 * reintroduced "you won't be charged yet" anywhere in a covered scope fails here
 * whichever file it is added to.
 */

const sourceByKey = new Map(catalog.map((entry) => [entry.key, entry.sourceText]));
const fileByKey = new Map(catalog.map((entry) => [entry.key, entry.filePath]));

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

/** Copy the product may not make again, in any active user-facing string. */
const RETIRED_CLAIMS: RegExp[] = [
  /charged yet/i,
  /charge the payment method/i,
  /authorize us to charge/i,
  /service fee on bookings/i,
  /hosts receive payouts/i,
  /refunds are issued/i,
  /payment processing is handled/i,
  /paid out as/i,
  /no payment (has been|was) collected/i,
];

describe("guest booking action", () => {
  it('offers "Request to book" wherever the guest sends a request', () => {
    // The public booking card and the preview a host reviews their own listing in.
    expect(sourceByKey.get("booking.request_to_book")).toBe("Request to book");
    expect(sourceByKey.get("host.preview.request_to_book")).toBe("Request to book");
    expect(fileByKey.get("booking.request_to_book")).toBe(
      "src/components/public/booking-widget.tsx",
    );
  });

  it('no longer offers "Reserve" as a booking action', () => {
    expect(sourceByKey.has("booking.reserve")).toBe(false);
    expect(sourceByKey.has("host.preview.reserve")).toBe(false);

    // "Reserved dates" is a calendar legend for dates that are taken — a different
    // word doing a different job, and deliberately left alone.
    const reserveActions = catalog.filter(
      (entry) => /^reserve$/i.test(entry.sourceText.trim()),
    );
    expect(reserveActions).toEqual([]);
    expect(sourceByKey.get("mobile.calendar.reserved")).toBe("Reserved dates");
  });

  it("explains what happens next instead of when the charge lands", () => {
    expect(sourceByKey.get("booking.host_review_notice")).toBe(
      "The host will review your request and share payment instructions if it is accepted.",
    );
    // The host's own preview of the card carries the same line, so a host is never
    // shown a booking action that promises less than the real one explains.
    expect(sourceByKey.get("host.preview.host_review_notice")).toBe(
      sourceByKey.get("booking.host_review_notice"),
    );
    expect(sourceByKey.has("booking.no_charge_notice")).toBe(false);
  });

  it("says the same thing in the tooltip the desktop card carries", () => {
    expect(sourceByKey.get("booking_widget.request_to_book_tooltip")).toBe(
      "Send a booking request. The host will review it and share payment instructions if it is accepted.",
    );
    expect(sourceByKey.has("booking_widget.reserve_tooltip")).toBe(false);
  });
});

describe("request and acceptance states", () => {
  it("tells the guest their request was sent, not that a booking exists", () => {
    expect(sourceByKey.get("booking.request_sent_body")).toBe(
      "Your booking request has been sent. The host will accept or decline it.",
    );
    // The pending hero keeps saying this is not a reservation yet: the distinction
    // between a request and an accepted booking is the whole product.
    expect(sourceByKey.get("booking.hero.host_deadline")).toContain(
      "not a confirmed reservation yet",
    );
  });

  it("points the accepted guest at the host for payment instructions", () => {
    expect(sourceByKey.get("booking.hero.accepted_guest")).toBe(
      "Your booking has been accepted. The host will share payment instructions with you.",
    );
    // And tells the host, from their side, that sharing them is now their job.
    expect(sourceByKey.get("booking.hero.accepted_host")).toContain(
      "Share your payment instructions with the guest directly",
    );
    // The shared confirmation dialog is the action every web host uses, so the
    // instruction must be present before acceptance as well as afterwards.
    expect(sourceByKey.get("host.booking.accept_payment_body")).toContain(
      "Nothing is sent until you confirm",
    );
  });

  it("states the full position where there is room for it", () => {
    expect(sourceByKey.get("booking.payment_arranged_with_host")).toBe(
      "Linger Homes does not collect or hold booking payments. Payment is arranged directly with the host after the booking is accepted.",
    );
  });

  it("does not promise a refund on the states that end a booking", () => {
    for (const key of [
      "booking.hero.expired_body",
      "booking.hero.declined_body",
      "booking.hero.cancelled_body",
    ]) {
      const source = sourceByKey.get(key) ?? "";
      expect(source, key).not.toBe("");
      expect(source, key).not.toMatch(/refund|charge|payout/i);
    }
  });
});

describe("the retired payment vocabulary", () => {
  it("appears in no active UI string", () => {
    const offenders = catalog.filter((entry) =>
      RETIRED_CLAIMS.some((claim) => claim.test(entry.sourceText)),
    );
    expect(offenders.map((entry) => `${entry.key}: ${entry.sourceText}`)).toEqual([]);
  });

  it("appears in no email the product sends", () => {
    const offenders = Object.entries(EMAIL_CATALOG)
      .filter(([, entry]) => RETIRED_CLAIMS.some((claim) => claim.test(entry.en)))
      .map(([key, entry]) => `${key}: ${entry.en}`);
    expect(offenders).toEqual([]);
  });

  it("is gone from the booking surfaces it used to live on", () => {
    for (const file of [
      "src/components/public/booking-widget.tsx",
      "src/app/(public)/properties/[slug]/page.tsx",
      "src/components/booking/booking-status-hero.tsx",
      "src/components/host/listing-form.tsx",
      "src/lib/services/notification.service.ts",
    ]) {
      const contents = read(file);
      for (const claim of RETIRED_CLAIMS) {
        expect(claim.test(contents), `${file} still matches ${claim}`).toBe(false);
      }
    }
  });
});

describe("booking email", () => {
  it("tells a guest the host will send the instructions, in English and Macedonian", () => {
    for (const locale of ["en", "mk"] as const) {
      const t = getEmailT(locale);
      const requested = t.t(
        "email.booking.payment_after_acceptance",
        "Linger Homes does not collect or hold booking payments. If the host accepts, they will share payment instructions with you directly.",
      );
      const accepted = t.ti(
        "email.booking.confirmed.accepted",
        'Good news — your booking for "{listing}" has been accepted. The host will share payment instructions with you.',
        { listing: "Villa Ohrid" },
      );

      // A key whose English drifts from its call site falls back to English, so a
      // Macedonian run that returns the English sentence is the failure this catches.
      expect(requested, locale).toContain("Linger Homes");
      expect(accepted, locale).toContain("Villa Ohrid");
      if (locale === "mk") {
        expect(requested).not.toBe(EMAIL_CATALOG["email.booking.payment_after_acceptance"].en);
        expect(accepted).not.toContain("Good news");
      }
    }
  });

  it("does not tell an accepted guest they are all set before payment is arranged", () => {
    expect(EMAIL_CATALOG["email.booking.confirmed.headline_accepted"].en).toBe(
      "Your booking has been accepted",
    );
    expect(EMAIL_CATALOG["email.booking.confirmed.headline_accepted"].mk).not.toBe(
      EMAIL_CATALOG["email.booking.confirmed.headline_accepted"].en,
    );
  });

  it("does not offer a refund when a booking ends", () => {
    for (const key of [
      "email.booking.dates_free",
      "email.booking.cancelled.payment_note",
      "email.booking.cancelled.callout_payment",
    ]) {
      expect(EMAIL_CATALOG[key], key).toBeDefined();
    }
    // Cancellation may say the word — but only to say we have nothing to give back.
    expect(EMAIL_CATALOG["email.booking.cancelled.payment_note"].en).toContain(
      "nothing for us to refund",
    );
    expect(EMAIL_CATALOG["email.booking.dates_free"].en).not.toMatch(/refund/i);
  });
});

describe("Terms and Privacy", () => {
  // These two are long-form content rather than catalog strings (see
  // scripts/extract-ui-strings.ts CONTENT_FILES), so they are read from source.
  const terms = read("src/app/(public)/terms/page.tsx");
  const privacy = read("src/app/(public)/privacy/page.tsx");

  it("no longer describes charging, fees, payouts or a processor", () => {
    for (const claim of [
      /authorize us to charge/i,
      /Refunds are issued to the original payment method/i,
      /Service fees are non-refundable/i,
      /We charge a service fee/i,
      /Hosts receive payouts/i,
      /Payouts are processed within/i,
      /Chargeback/i,
      /payment processors/i,
    ]) {
      expect(claim.test(terms), `terms still matches ${claim}`).toBe(false);
    }

    for (const claim of [
      /payment processing is handled/i,
      /Payment Processors:/i,
      /To process bookings and payments/i,
    ]) {
      expect(claim.test(privacy), `privacy still matches ${claim}`).toBe(false);
    }
  });

  it("states what actually happens instead", () => {
    // JSX wraps prose across lines, so the claims are matched against the page with
    // its indentation collapsed rather than against a hand-copied line break.
    const flat = (source: string) => source.replace(/\s+/g, " ");
    expect(flat(terms)).toContain(
      "Linger Homes does not collect or hold booking payments.",
    );
    expect(flat(terms)).toContain("request-to-book basis");
    expect(flat(terms)).toContain(
      "The host arranges payment with you directly after accepting your request",
    );
    expect(flat(privacy)).toContain("We do not collect or hold booking payments");
    expect(flat(privacy)).not.toContain("we never see card or bank details");
    expect(flat(privacy)).toContain(
      "If a user voluntarily shares payment instructions in Messages",
    );
  });
});
