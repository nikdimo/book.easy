import { describe, expect, it } from "vitest";
import { listingFormSchema } from "@/lib/validations/listing.schema";

const validListing = {
  currency: "EUR",
  title: "Apartment by the sea",
  description: "A comfortable apartment with everything guests need.",
  propertyType: "APARTMENT",
  address: "Beach Road 12",
  city: "Nea Moudania",
  country: "Greece",
  latitude: "40.2439",
  longitude: "23.2848",
  locationSource: "AUTOCOMPLETE",
  locationConfirmed: "true",
  maxGuests: "4",
  bedrooms: "2",
  bathrooms: "1",
  beds: "3",
  baseNightlyRate: "90",
  cleaningFee: "20",
  minNights: "2",
};

describe("listingFormSchema location validation", () => {
  it("accepts a listing with confirmed coordinates", () => {
    expect(listingFormSchema.safeParse(validListing).success).toBe(true);
  });

  it("rejects publishing without exact coordinates", () => {
    const result = listingFormSchema.safeParse({
      ...validListing,
      latitude: undefined,
      longitude: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates that became stale after an autocomplete edit", () => {
    const result = listingFormSchema.safeParse({
      ...validListing,
      locationConfirmed: "false",
    });
    expect(result.success).toBe(false);
  });
});
