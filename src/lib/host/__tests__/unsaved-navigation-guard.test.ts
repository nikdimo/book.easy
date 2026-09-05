import { describe, expect, it } from "vitest";
import { shouldGuardNavigation } from "@/lib/host/use-unsaved-navigation-guard";

const CURRENT = "https://lingerhomes.com/host/listings/listing-1/edit?pane=edit";

describe("shouldGuardNavigation", () => {
  it.each([
    "/host/listings",
    "/host/listings/listing-1/availability",
    "https://example.com/leave",
    "/host/listings/listing-1/edit?pane=preview",
  ])("guards a navigation that can replace the editor: %s", (href) => {
    expect(shouldGuardNavigation({ href }, CURRENT)).toBe(true);
  });

  it.each([
    { href: null },
    { href: "#photos" },
    { href: "mailto:host@example.com" },
    { href: "/host/listings", target: "_blank" },
    { href: "/host/listings", download: true },
    { href: CURRENT },
  ])("does not interfere with a non-destructive link intent", (intent) => {
    expect(shouldGuardNavigation(intent, CURRENT)).toBe(false);
  });
});
