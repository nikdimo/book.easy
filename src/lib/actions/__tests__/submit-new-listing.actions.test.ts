import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server remains the authority.
 *
 * Every step of the create flow now refuses to navigate on its own invalid fields, and
 * the Review screen refuses to publish while it can see a blocker — but both run in the
 * host's tab, and `submitNewListing` is reachable without either. These tests drive it
 * with the payloads a bypassed or stale client would send and check that nothing is
 * written.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  propertyCreate: vi.fn(),
  listingCreate: vi.fn(),
  getExchangeRates: vi.fn(),
  generateUniqueSlug: vi.fn(),
  deleteOwnedListingDraftWithCleanup: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListingCaches: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    property: { create: mocks.propertyCreate },
    listing: { create: mocks.listingCreate },
  },
}));
vi.mock("@/lib/currency/rates", () => ({ getExchangeRates: mocks.getExchangeRates }));
vi.mock("@/lib/services/listing.service", () => ({
  generateUniqueSlug: mocks.generateUniqueSlug,
  archiveOrDeleteListing: vi.fn(),
}));
vi.mock("@/lib/listing-draft-cleanup", () => ({
  deleteOwnedListingDraftWithCleanup: mocks.deleteOwnedListingDraftWithCleanup,
}));
vi.mock("@/lib/storage/upload-cleanup", () => ({
  enqueueUploadDeletions: vi.fn(async () => [] as string[]),
  sweepUploads: vi.fn(async () => ({ scanned: 0, deleted: 0, kept: 0, failed: 0 })),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));

import { submitNewListing } from "@/lib/actions/listing.actions";
import { MIN_PUBLISH_PHOTOS } from "@/lib/host/v2/photo-draft";
import { emptyDepositPoliciesDraft } from "@/lib/host/v2/listing-deposit-draft";

/** Tomorrow, so the availability answer is never the reason a case fails. */
function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function publishableForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields: Record<string, string> = {
    title: "Sunny house near the bazaar",
    description: "A bright two-bedroom house a short walk from the old bazaar and the river.",
    propertyType: "HOUSE",
    spaceType: "ENTIRE_PLACE",
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
    freeCancellationDaysBeforeCheckIn: "7",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  formData.append("acceptedPaymentMethods", "BANK_TRANSFER_LOCAL_SEPA");
  formData.append("acceptedPaymentMethods", "PAYPAL");
  formData.set("paymentInstructionTemplates", "{}");
  for (let index = 0; index < MIN_PUBLISH_PHOTOS; index += 1) {
    formData.append(
      "mediaItems",
      JSON.stringify({ url: `/uploads/photo-${index}.jpg`, mediaType: "IMAGE" }),
    );
  }
  formData.set(
    "prePublishPlan",
    JSON.stringify({ availabilityStart: { mode: "from", startDate: tomorrow() } }),
  );
  return formData;
}

/** Nothing was written: no property row, no listing row. */
function wroteNothing() {
  expect(mocks.propertyCreate).not.toHaveBeenCalled();
  expect(mocks.listingCreate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
  mocks.getExchangeRates.mockResolvedValue({ rates: { USD: 1.08 } });
  mocks.generateUniqueSlug.mockResolvedValue("sunny-house");
  mocks.propertyCreate.mockResolvedValue({ id: "property-1" });
  mocks.listingCreate.mockResolvedValue({ id: "listing-1", slug: "sunny-house" });
});

describe("submitNewListing — the happy path still publishes", () => {
  it("creates the listing when everything holds", async () => {
    const result = await submitNewListing(publishableForm());

    expect(result).toEqual({ success: true, listingId: "listing-1", slug: "sunny-house" });
    expect(mocks.listingCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft's own currency rather than replacing it with the default", async () => {
    await submitNewListing(publishableForm({ currency: "USD" }));

    expect(mocks.listingCreate.mock.calls[0][0].data.pricingRule.create.currency).toBe("USD");
  });

  it("keeps an older publisher usable and leaves payment setup unanswered", async () => {
    const formData = publishableForm();
    formData.delete("acceptedPaymentMethods");
    formData.delete("paymentInstructionTemplates");

    const result = await submitNewListing(formData);

    expect(result).toEqual({ success: true, listingId: "listing-1", slug: "sunny-house" });
    expect(mocks.listingCreate.mock.calls[0][0].data).not.toHaveProperty(
      "paymentMethodsReviewedAt",
    );
  });
});

describe("submitNewListing — authentication and ownership", () => {
  it("refuses a signed-out caller", async () => {
    mocks.auth.mockResolvedValue(null);

    expect(await submitNewListing(publishableForm())).toEqual({ error: "Not authorized" });
    wroteNothing();
  });

  it("refuses a signed-in user who is not a host", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1", isHost: false } });

    expect(await submitNewListing(publishableForm())).toEqual({ error: "Not authorized" });
    wroteNothing();
  });
});

describe("submitNewListing — a bypassed client writes nothing", () => {
  const manipulated: [string, Record<string, string>][] = [
    ["a title below the minimum", { title: "Hi" }],
    ["a description below the minimum", { description: "Too short." }],
    ["no property type", { propertyType: "" }],
    ["an address below the minimum", { address: "A" }],
    ["no city", { city: "" }],
    ["coordinates that are not a place", { latitude: "999" }],
    ["a guest count of zero", { maxGuests: "0" }],
    ["a guest count above the ceiling", { maxGuests: "21" }],
    ["more beds than the schema allows", { beds: "41" }],
    ["a nightly rate below the floor", { baseNightlyRate: "0" }],
    ["a currency that is not a currency code", { currency: "EURO" }],
    ["a promotion discount outside 5–50%", { promotionType: "PERCENT_DISCOUNT", promotionPercent: "80" }],
  ];

  for (const [description, overrides] of manipulated) {
    it(`refuses ${description}`, async () => {
      const result = await submitNewListing(publishableForm(overrides));

      expect(result).toHaveProperty("error");
      wroteNothing();
    });
  }

  it("refuses a currency no rate is quoted for", async () => {
    mocks.getExchangeRates.mockResolvedValue({ rates: {} });

    const result = await submitNewListing(publishableForm({ currency: "MKD" }));

    expect(result).toEqual({
      error: "That currency is not currently available. Choose another currency.",
    });
    wroteNothing();
  });

  it("refuses fewer photos than the shared minimum, however the client counted", async () => {
    const formData = publishableForm();
    formData.delete("mediaItems");
    for (let index = 0; index < MIN_PUBLISH_PHOTOS - 1; index += 1) {
      formData.append(
        "mediaItems",
        JSON.stringify({ url: `/uploads/photo-${index}.jpg`, mediaType: "IMAGE" }),
      );
    }

    expect(await submitNewListing(formData)).toEqual({
      error: `Add at least ${MIN_PUBLISH_PHOTOS} photos before publishing`,
    });
    wroteNothing();
  });

  it("does not let videos stand in for the photo minimum", async () => {
    const formData = publishableForm();
    formData.delete("mediaItems");
    for (let index = 0; index < MIN_PUBLISH_PHOTOS + 2; index += 1) {
      formData.append(
        "mediaItems",
        JSON.stringify({ url: `/uploads/clip-${index}.mp4`, mediaType: "VIDEO" }),
      );
    }

    expect(await submitNewListing(formData)).toHaveProperty("error");
    wroteNothing();
  });

  it("refuses a draft that never answered the availability question", async () => {
    const formData = publishableForm();
    formData.set("prePublishPlan", JSON.stringify({}));

    expect(await submitNewListing(formData)).toEqual({
      error: "Confirm when guests can start booking before publishing.",
    });
    wroteNothing();
  });

  it("refuses an availability start date that has already passed", async () => {
    const formData = publishableForm();
    formData.set(
      "prePublishPlan",
      JSON.stringify({ availabilityStart: { mode: "from", startDate: "2020-01-01" } }),
    );

    expect(await submitNewListing(formData)).toEqual({
      error:
        "That availability start date has already passed. Choose today or a later date.",
    });
    wroteNothing();
  });

  it("refuses free cleaning on a listing with no cleaning fee", async () => {
    const result = await submitNewListing(
      publishableForm({ promotionFreeCleaning: "true", promotionType: "NONE", cleaningFee: "0" }),
    );

    expect(result).toEqual({ error: "Add a cleaning fee before offering free cleaning." });
    wroteNothing();
  });
});

describe("submitNewListing — the structured house rules", () => {
  it("writes every rule the draft carried onto the listing", async () => {
    await submitNewListing(
      publishableForm({
        checkInTime: "16:00",
        checkOutTime: "10:00",
        petPolicy: "ASK_HOST",
        smokingPolicy: "OUTDOORS_ONLY",
        eventPolicy: "NOT_ALLOWED",
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        additionalRules: "No shoes indoors.",
      }),
    );

    expect(mocks.listingCreate.mock.calls[0][0].data).toMatchObject({
      checkInTime: "16:00",
      checkOutTime: "10:00",
      maxGuests: 4,
      petPolicy: "ASK_HOST",
      smokingPolicy: "OUTDOORS_ONLY",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      additionalRules: "No shoes indoors.",
    });
  });

  it("writes NULL for every rule a client never asked about", async () => {
    // A mobile publish, or a draft from before this screen existed. Publishing a blank
    // policy as "not allowed" would put a rule on a live listing that no host chose.
    await submitNewListing(publishableForm());

    expect(mocks.listingCreate.mock.calls[0][0].data).toMatchObject({
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      quietHoursStart: null,
      quietHoursEnd: null,
      additionalRules: null,
    });
  });

  it("does not publish quiet-hours times for a listing with no quiet hours", async () => {
    // A draft that once had times and was later switched off still carries them.
    await submitNewListing(
      publishableForm({
        quietHoursPolicy: "NONE",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
      }),
    );

    expect(mocks.listingCreate.mock.calls[0][0].data).toMatchObject({
      quietHoursPolicy: "NONE",
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });

  it("publishes an imported off-grid arrival time rather than dropping it", async () => {
    await submitNewListing(publishableForm({ checkInTime: "14:15" }));

    expect(mocks.listingCreate.mock.calls[0][0].data.checkInTime).toBe("14:15");
  });

  it("stores the host's own words, never a translation of them", async () => {
    const written = "Молиме извадете ги чевлите.";

    await submitNewListing(publishableForm({ additionalRules: written }));

    expect(mocks.listingCreate.mock.calls[0][0].data.additionalRules).toBe(written);
  });

  it("refuses additional rules the column could not hold, and writes nothing", async () => {
    const result = await submitNewListing(
      publishableForm({ additionalRules: "x".repeat(5_000) }),
    );

    expect(result).toHaveProperty("error");
    wroteNothing();
  });
});

describe("the deposit answer", () => {
  /** The listing row the publish wrote. */
  function created() {
    return mocks.listingCreate.mock.calls[0][0].data;
  }

  function withDeposits(answer: unknown): FormData {
    const formData = publishableForm();
    formData.set("depositPolicies", JSON.stringify(answer));
    return formData;
  }

  it("writes both policies and marks the question reviewed", async () => {
    const answer = emptyDepositPoliciesDraft();
    answer.currency = "EUR";
    answer.advancePayment = {
      enabled: true,
      amountType: "PERCENTAGE",
      value: "20",
      dueTiming: "DAYS_BEFORE_CHECK_IN",
      dueDaysBeforeCheckIn: 7,
    };
    answer.damageDeposit = {
      enabled: true,
      amountType: "FIXED",
      value: "200",
      dueTiming: "AT_CHECK_IN",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: 7,
    };

    await submitNewListing(withDeposits(answer));

    expect(created()).toMatchObject({
      advancePaymentEnabled: true,
      advancePaymentType: "PERCENTAGE",
      advancePaymentValue: "20",
      advancePaymentDueTiming: "DAYS_BEFORE_CHECK_IN",
      advancePaymentDueDaysBeforeCheckIn: 7,
      damageDepositEnabled: true,
      damageDepositType: "FIXED",
      damageDepositValue: "200",
      damageDepositDueTiming: "AT_CHECK_IN",
      damageDepositReturnDaysAfterCheckout: 7,
      // The listing's own currency, not one the client chose.
      depositPoliciesCurrency: "EUR",
    });
    expect(created().depositPoliciesReviewedAt).toBeInstanceOf(Date);
  });

  it("refuses to relabel deposit amounts reviewed in another currency", async () => {
    const answer = emptyDepositPoliciesDraft();
    answer.damageDeposit = {
      enabled: true,
      amountType: "FIXED",
      value: "5000",
      dueTiming: "AT_CHECK_IN",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: null,
    };
    const formData = publishableForm({ currency: "USD" });
    formData.set("depositPolicies", JSON.stringify({ ...answer, currency: "EUR" }));

    const result = await submitNewListing(formData);

    expect(result).toEqual({
      error:
        "Review the advance payment and damage deposit amounts after changing the listing currency.",
    });
    wroteNothing();
  });

  it("marks an explicit 'neither' reviewed and stores no currency", async () => {
    // This is the answer that stops a new listing quoting UNANSWERED terms to guests
    // and raising an incomplete payment-arrangements task the day it goes live.
    await submitNewListing(withDeposits(emptyDepositPoliciesDraft()));

    expect(created()).toMatchObject({
      advancePaymentEnabled: false,
      damageDepositEnabled: false,
      depositPoliciesCurrency: null,
    });
    expect(created().depositPoliciesReviewedAt).toBeInstanceOf(Date);
  });

  it("leaves the marker alone for a publisher that never asked", async () => {
    // The mobile app and the classic wizard have no deposit screen. Their listings
    // stay publishable and keep the Today task that collects the answer.
    await submitNewListing(publishableForm());

    expect(created()).not.toHaveProperty("depositPoliciesReviewedAt");
    expect(created()).not.toHaveProperty("advancePaymentEnabled");
  });

  it("refuses an answer whose amounts do not stand up, and writes nothing", async () => {
    const answer = emptyDepositPoliciesDraft();
    answer.currency = "EUR";
    answer.advancePayment = {
      enabled: true,
      amountType: "PERCENTAGE",
      value: "150",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
    };

    const result = await submitNewListing(withDeposits(answer));

    expect(result).toHaveProperty("error");
    wroteNothing();
  });

  it("refuses a malformed answer rather than reading it as 'neither'", async () => {
    const formData = publishableForm();
    formData.set("depositPolicies", "{not json");

    expect(await submitNewListing(formData)).toHaveProperty("error");
    wroteNothing();

    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.getExchangeRates.mockResolvedValue({ rates: { USD: 1.08 } });
    mocks.generateUniqueSlug.mockResolvedValue("sunny-house");
    mocks.propertyCreate.mockResolvedValue({ id: "property-1" });
    mocks.listingCreate.mockResolvedValue({ id: "listing-1", slug: "sunny-house" });

    expect(await submitNewListing(withDeposits({ reviewed: true }))).toHaveProperty("error");
    wroteNothing();
  });
});
