import { describe, expect, it } from "vitest";
import { appendMobileListingEditorTextFields } from "@/lib/mobile-listing-editor";

describe("appendMobileListingEditorTextFields", () => {
  it("keeps standard pricing out of existing-listing detail updates", () => {
    const formData = new FormData();

    appendMobileListingEditorTextFields(formData, {
      title: "Updated title",
      currency: "EUR",
      baseNightlyRate: 75,
      cleaningFee: 20,
      minNights: 4,
    });

    expect(formData.get("title")).toBe("Updated title");
    expect(formData.get("currency")).toBe("EUR");
    expect(formData.has("baseNightlyRate")).toBe(false);
    expect(formData.has("cleaningFee")).toBe(false);
    expect(formData.has("minNights")).toBe(false);
  });
});
