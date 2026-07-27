import { describe, expect, it } from "vitest";
import { streetViewPanoId } from "@/lib/utils/street-view-response";

describe("streetViewPanoId", () => {
  it("reads the direct panorama data returned to callbacks", () => {
    expect(
      streetViewPanoId({ location: { pano: "callback-panorama" } })
    ).toBe("callback-panorama");
  });

  it("also reads the wrapped response returned by the Promise API", () => {
    expect(
      streetViewPanoId({
        data: { location: { pano: "promise-panorama" } },
      })
    ).toBe("promise-panorama");
  });

  it("returns undefined when Google supplies no panorama", () => {
    expect(streetViewPanoId(null)).toBeUndefined();
    expect(streetViewPanoId({})).toBeUndefined();
  });
});
