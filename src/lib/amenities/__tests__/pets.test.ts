import { describe, expect, it } from "vitest";
import {
  PETS_ALLOWED_AMENITY_KEY,
  PETS_ALLOWED_AMENITY_NAME,
  isPetsAllowedFilter,
  petPolicyFromAmenityLabel,
  splitImportedPetLabels,
} from "@/lib/amenities/pets";

describe("the pets filter token", () => {
  it("keeps the exact name guests have in their bookmarked search URLs", () => {
    // Changing this string breaks every shared `?amenities=Pets+allowed` link.
    expect(PETS_ALLOWED_AMENITY_NAME).toBe("Pets allowed");
    expect(PETS_ALLOWED_AMENITY_KEY).toBe("pets_allowed");
  });

  it("recognises the token however it arrives in a URL", () => {
    expect(isPetsAllowedFilter("Pets allowed")).toBe(true);
    expect(isPetsAllowedFilter("pets allowed")).toBe(true);
    expect(isPetsAllowedFilter("  Pets Allowed  ")).toBe(true);
  });

  it("does not swallow other amenities", () => {
    expect(isPetsAllowedFilter("Pool")).toBe(false);
    expect(isPetsAllowedFilter("Pet bowls")).toBe(false);
    expect(isPetsAllowedFilter("")).toBe(false);
  });
});

describe("petPolicyFromAmenityLabel", () => {
  it("reads the labels providers use for allowing pets", () => {
    for (const label of [
      "Pets allowed",
      "Pets welcome",
      "Pet friendly",
      "Pets permitted",
      "Dogs allowed",
      "Suitable for pets",
    ]) {
      expect(petPolicyFromAmenityLabel(label)).toBe("ALLOWED");
    }
  });

  it("reads a refusal as a refusal, not as the opposite", () => {
    // The trap: "No pets allowed" contains "pets allowed".
    for (const label of ["No pets", "No pets allowed", "Pets not allowed", "No dogs"]) {
      expect(petPolicyFromAmenityLabel(label)).toBe("NOT_ALLOWED");
    }
  });

  it("reads an on-request policy as its own answer", () => {
    for (const label of ["Pets on request", "Pets allowed on request"]) {
      expect(petPolicyFromAmenityLabel(label)).toBe("ASK_HOST");
    }
  });

  it("says nothing about labels that describe equipment rather than a rule", () => {
    for (const label of ["Pet bowls", "Dog bed", "Kitchen", "Wi-Fi", ""]) {
      expect(petPolicyFromAmenityLabel(label)).toBeNull();
    }
  });
});

describe("splitImportedPetLabels", () => {
  it("takes the policy out and leaves every other amenity alone", () => {
    const result = splitImportedPetLabels(["Wi-Fi", "Pets allowed", "Kitchen"]);

    expect(result.petPolicy).toBe("ALLOWED");
    expect(result.amenities).toEqual(["Wi-Fi", "Kitchen"]);
  });

  it("never leaves a pet label behind as an amenity", () => {
    // Leaving one is exactly the duplicate source of truth the migration removed —
    // recreated on every import if the importer did not do this.
    const result = splitImportedPetLabels(["No pets", "Pets allowed", "Pool"]);

    expect(result.amenities).toEqual(["Pool"]);
  });

  it("resolves a provider that publishes two contradicting labels, deterministically", () => {
    expect(splitImportedPetLabels(["Pets allowed", "No pets"]).petPolicy).toBe(
      "ALLOWED",
    );
    expect(splitImportedPetLabels(["No pets", "Pets allowed"]).petPolicy).toBe(
      "NOT_ALLOWED",
    );
  });

  it("reports no policy when the provider stated none", () => {
    const result = splitImportedPetLabels(["Wi-Fi", "Kitchen"]);

    expect(result.petPolicy).toBeNull();
    expect(result.amenities).toEqual(["Wi-Fi", "Kitchen"]);
  });

  it("keeps the order the provider gave, so the first photo-order-like list is stable", () => {
    expect(
      splitImportedPetLabels(["Pool", "Pets allowed", "Wi-Fi", "Kitchen"]).amenities,
    ).toEqual(["Pool", "Wi-Fi", "Kitchen"]);
  });
});
