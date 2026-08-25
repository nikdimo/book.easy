import { describe, expect, it } from "vitest";
import { relativeRedirect } from "./relative-redirect";

describe("relativeRedirect", () => {
  it("keeps an internal redirect relative to the browser's public origin", () => {
    const response = relativeRedirect("/host/start/property-type");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/host/start/property-type");
    expect(response.headers.get("location")).not.toContain("localhost");
  });

  it("supports a 303 form redirect", () => {
    const response = relativeRedirect("/marketing/confirmed", 303);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/marketing/confirmed");
  });

  it.each(["https://example.com/path", "//example.com/path", "host/start/new"])(
    "rejects unsafe destination %s",
    (destination) => {
      expect(() => relativeRedirect(destination)).toThrow(
        "Relative redirects must use a site-relative path.",
      );
    },
  );
});
