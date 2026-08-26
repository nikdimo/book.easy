import { describe, expect, it } from "vitest";
import { automaticTranslationAllowedForPath } from "@/lib/i18n/translation-experience";

describe("automaticTranslationAllowedForPath", () => {
  it("allows Google's clearly labelled fallback on public discovery pages", () => {
    expect(automaticTranslationAllowedForPath("/")).toBe(true);
    expect(automaticTranslationAllowedForPath("/properties")).toBe(true);
    expect(
      automaticTranslationAllowedForPath("/properties/lake-house"),
    ).toBe(true);
    expect(automaticTranslationAllowedForPath("/contact")).toBe(true);
  });

  it("keeps automatic page translation away from operational surfaces", () => {
    for (const pathname of [
      "/account/bookings",
      "/admin",
      "/bookings/confirm",
      "/host/v2/reservations",
      "/messages/thread-1",
      "/mobile-auth/complete",
    ]) {
      expect(automaticTranslationAllowedForPath(pathname)).toBe(false);
    }
  });

  it("does not reject unrelated paths that merely contain an operational word", () => {
    expect(automaticTranslationAllowedForPath("/properties/host-house")).toBe(
      true,
    );
  });
});

