import { describe, expect, it } from "vitest";
import { listingFormSchema } from "@/lib/validations/listing.schema";
import { ADDITIONAL_RULES_MAX } from "@/lib/host/v2/listing-house-rules";

/**
 * What publishing does with the house rules a draft carries.
 *
 * This schema is the gate every publication passes through — the web flow, the mobile
 * app and the classic wizard all end here — so it is where "unanswered stays unanswered"
 * has to hold.
 */

function form(overrides: Record<string, unknown> = {}) {
  return {
    title: "Sunny house near the old bazaar",
    description:
      "A bright two-bedroom house a short walk from the old bazaar and the river.",
    propertyType: "HOUSE",
    address: "Partizanska 15",
    city: "Skopje",
    country: "MK",
    latitude: "41.9981",
    longitude: "21.4254",
    locationSource: "AUTOCOMPLETE",
    locationConfirmed: "true",
    maxGuests: "4",
    bedrooms: "2",
    bathrooms: "1",
    beds: "2",
    currency: "EUR",
    baseNightlyRate: "60",
    ...overrides,
  };
}

function parse(overrides: Record<string, unknown> = {}) {
  const parsed = listingFormSchema.safeParse(form(overrides));
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
}

describe("publishing the structured house rules", () => {
  it("carries every answered rule through to the listing", () => {
    expect(
      parse({
        petPolicy: "ASK_HOST",
        smokingPolicy: "OUTDOORS_ONLY",
        eventPolicy: "NOT_ALLOWED",
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        additionalRules: "No shoes indoors.",
      }),
    ).toMatchObject({
      petPolicy: "ASK_HOST",
      smokingPolicy: "OUTDOORS_ONLY",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      additionalRules: "No shoes indoors.",
    });
  });

  it("stores null, never a refusal, for a rule nobody answered", () => {
    // The whole reason these columns are nullable: a listing published by a client with
    // no rules screen has said nothing about smoking, and the row must record that.
    expect(parse()).toMatchObject({
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
    });
  });

  it("does not block a publication that answered nothing", () => {
    // The create flow requires answers at the step that asks. Publishing must not stall
    // an older draft or a mobile client on a question that was never on their screen.
    expect(listingFormSchema.safeParse(form()).success).toBe(true);
  });

  it("reads a policy this build does not know as unanswered", () => {
    expect(parse({ petPolicy: "MAYBE" }).petPolicy).toBeNull();
  });

  it("refuses additional rules longer than the documented limit", () => {
    const parsed = listingFormSchema.safeParse(
      form({ additionalRules: "x".repeat(ADDITIONAL_RULES_MAX + 1) }),
    );

    expect(parsed.success).toBe(false);
  });

  it("keeps an imported off-grid arrival time instead of rounding it to flexible", () => {
    // The old half-hour-only transform silently dropped "14:15" at publish, after the
    // create flow and the editor had both shown it to the host as their arrival time.
    expect(parse({ checkInTime: "14:15" }).checkInTime).toBe("14:15");
    expect(parse({ quietHoursStart: "22:15" }).quietHoursStart).toBe("22:15");
  });

  it("still normalises a value that is not a time at all", () => {
    expect(parse({ checkInTime: "25:00" }).checkInTime).toBe("");
    expect(parse({ checkOutTime: "whenever" }).checkOutTime).toBe("");
  });
});
