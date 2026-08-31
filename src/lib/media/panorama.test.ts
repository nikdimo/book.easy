import { describe, expect, it } from "vitest";
import { isEquirectangularPanoramaDimensions } from "./panorama";

describe("isEquirectangularPanoramaDimensions", () => {
  it("recognizes full-size 2:1 panoramas and small stitching differences", () => {
    expect(isEquirectangularPanoramaDimensions(6000, 3000)).toBe(true);
    expect(isEquirectangularPanoramaDimensions(3900, 2000)).toBe(true);
    expect(isEquirectangularPanoramaDimensions(1774, 887)).toBe(true);
  });

  it("does not mistake ordinary or tiny wide images for panoramas", () => {
    expect(isEquirectangularPanoramaDimensions(4000, 3000)).toBe(false);
    expect(isEquirectangularPanoramaDimensions(1200, 600)).toBe(false);
    expect(isEquirectangularPanoramaDimensions(1600, 0)).toBe(false);
  });
});
