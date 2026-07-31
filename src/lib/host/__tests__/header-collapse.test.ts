import { describe, expect, it } from "vitest";
import {
  HEADER_COLLAPSE_SLACK,
  nextHeaderHidden,
} from "@/lib/host/header-collapse";

// A tall page with plenty of room below the fold.
const roomy = { viewport: 800, total: 4000 };

describe("nextHeaderHidden", () => {
  it("hides the header when scrolling down", () => {
    expect(
      nextHeaderHidden({ top: 500, previous: 400, ...roomy }),
    ).toBe(true);
  });

  it("shows the header when scrolling up", () => {
    expect(
      nextHeaderHidden({ top: 400, previous: 500, ...roomy }),
    ).toBe(false);
  });

  it("always restores the header at the top of the page", () => {
    // Even though this is a downward delta, being at the top wins.
    expect(nextHeaderHidden({ top: 0, previous: 0, ...roomy })).toBe(false);
  });

  it("ignores jitter below the movement threshold", () => {
    expect(nextHeaderHidden({ top: 502, previous: 500, ...roomy })).toBeNull();
  });

  it("does not toggle while a text field has focus", () => {
    expect(
      nextHeaderHidden({ top: 500, previous: 400, ...roomy, editing: true }),
    ).toBeNull();
  });

  it("ignores the settling window after a toggle", () => {
    expect(
      nextHeaderHidden({ top: 500, previous: 400, ...roomy, locked: true }),
    ).toBeNull();
  });

  describe("the bottom-of-page oscillation", () => {
    // Reproduces the reported flicker. Collapsing the header grows the scroll
    // area, the browser clamps scrollTop, and that clamp reads as a scroll up.
    const viewport = 800;
    const total = 4000;
    const atBottom = total - viewport; // 3200

    it("makes no decision within the slack zone at the bottom", () => {
      expect(
        nextHeaderHidden({
          top: atBottom,
          previous: atBottom - 100,
          viewport,
          total,
        }),
      ).toBeNull();
    });

    it("does not re-show the header on the clamp that follows", () => {
      // The clamp: scrollTop snaps back by roughly the header height.
      expect(
        nextHeaderHidden({
          top: atBottom - 72,
          previous: atBottom,
          viewport,
          total,
        }),
      ).toBeNull();
    });

    it("still responds normally just outside the slack zone", () => {
      const outside = atBottom - HEADER_COLLAPSE_SLACK - 10;
      expect(
        nextHeaderHidden({
          top: outside,
          previous: outside - 50,
          viewport,
          total,
        }),
      ).toBe(true);
    });

    it("cannot oscillate: repeated clamps never flip the state", () => {
      let hidden = false;
      let flips = 0;
      let top = atBottom;
      let previous = atBottom - 100;

      // Ten rounds of "scroll to bottom, get clamped, repeat".
      for (let round = 0; round < 10; round += 1) {
        const decision = nextHeaderHidden({ top, previous, viewport, total });
        if (decision !== null && decision !== hidden) {
          hidden = decision;
          flips += 1;
        }
        previous = top;
        top = top === atBottom ? atBottom - 72 : atBottom;
      }

      // Count transitions, not the final value: an even number of flips would
      // land back on `false` and hide the bug behind a passing assertion.
      expect(flips).toBe(0);
      expect(hidden).toBe(false);
    });
  });
});
