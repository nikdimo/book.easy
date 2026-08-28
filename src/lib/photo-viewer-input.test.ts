import { describe, expect, it } from "vitest";
import { createPhotoWheelState, photoStepFromWheel } from "./photo-viewer-input";

function wheel(
  state: ReturnType<typeof createPhotoWheelState>,
  deltaY: number,
  timeStamp: number,
  deltaX = 0,
  deltaMode = 0
) {
  return photoStepFromWheel(state, {
    deltaX,
    deltaY,
    deltaMode,
    timeStamp,
    pageHeight: 800,
  });
}

describe("photoStepFromWheel", () => {
  it("moves forward and backward with ordinary mouse-wheel notches", () => {
    const state = createPhotoWheelState();

    expect(wheel(state, 100, 10)).toBe(1);
    expect(wheel(state, -100, 250)).toBe(-1);
  });

  it("accumulates a trackpad gesture but navigates only once", () => {
    const state = createPhotoWheelState();

    expect(wheel(state, 12, 10)).toBe(0);
    expect(wheel(state, 12, 20)).toBe(0);
    expect(wheel(state, 12, 30)).toBe(1);
    expect(wheel(state, 80, 100)).toBe(0);
    expect(wheel(state, 40, 300)).toBe(1);
  });

  it("uses the dominant horizontal axis for sideways trackpad scrolling", () => {
    const state = createPhotoWheelState();

    expect(wheel(state, 4, 10, -50)).toBe(-1);
  });

  it("normalizes line-based wheel events", () => {
    const state = createPhotoWheelState();

    expect(wheel(state, 3, 10, 0, 1)).toBe(1);
  });
});
