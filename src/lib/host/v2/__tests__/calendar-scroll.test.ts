import { describe, expect, it } from "vitest";
import {
  MOBILE_MONTH_TOOLBAR_HEIGHT,
  MOBILE_STICKY_OFFSET,
  MONTH_READ_SLACK,
  containerStreamAtEnd,
  containerScrollTop,
  documentStreamAtEnd,
  documentScrollTop,
  monthReadThreshold,
  monthStreamScrollMode,
  pickVisibleMonth,
} from "@/lib/host/v2/calendar-scroll";

const MONTHS = ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"];

/** A month block is 320px tall in these fixtures, laid out back to back. */
const BLOCK = 320;

/** Where the four month blocks sit in the viewport at a given scroll offset. */
function sectionsAtDocumentScroll(scrollY: number, streamTop = 200) {
  return MONTHS.map((month, position) => ({
    month,
    top: streamTop + position * BLOCK - scrollY,
  }));
}

function sectionsInPane(paneTop: number, paneScrollTop: number) {
  return MONTHS.map((month, position) => ({
    month,
    top: paneTop + position * BLOCK - paneScrollTop,
  }));
}

describe("monthStreamScrollMode", () => {
  it("calls a pane that overflows its own box the scroller", () => {
    expect(monthStreamScrollMode({ scrollHeight: 4000, clientHeight: 600 })).toBe(
      "container",
    );
  });

  it("leaves scrolling to the document when the pane fits its content", () => {
    // Below `md` the pane has no `overflow-y`, so it grows to its content and the two
    // heights agree. A sub-pixel difference is layout noise, not a scroller.
    expect(monthStreamScrollMode({ scrollHeight: 4000, clientHeight: 4000 })).toBe(
      "document",
    );
    expect(monthStreamScrollMode({ scrollHeight: 4000.5, clientHeight: 4000 })).toBe(
      "document",
    );
  });
});

describe("monthReadThreshold", () => {
  it("measures against the pane when the pane scrolls", () => {
    expect(monthReadThreshold({ mode: "container", paneTop: 180 })).toBe(
      180 + MONTH_READ_SLACK,
    );
  });

  it("measures against the sticky chrome when the document scrolls", () => {
    // The pane's own top is deliberately absurd here: in document mode it must not
    // reach the answer at all.
    expect(monthReadThreshold({ mode: "document", paneTop: 999 })).toBe(
      MOBILE_STICKY_OFFSET + MONTH_READ_SLACK,
    );
  });

  it("clears the calendar toolbar and weekday row", () => {
    expect(MOBILE_STICKY_OFFSET).toBe(
      MOBILE_MONTH_TOOLBAR_HEIGHT + 28,
    );
  });
});

describe("pickVisibleMonth on a document-scrolled stream", () => {
  const read = (scrollY: number) =>
    pickVisibleMonth(
      sectionsAtDocumentScroll(scrollY),
      monthReadThreshold({
        mode: "document",
        // The pane moves with the document, so its top is whatever the scroll left it
        // at. A correct reading is indifferent to it.
        paneTop: 200 - scrollY,
      }),
      MONTHS[0],
    );

  it("reports the first month before anything has scrolled", () => {
    expect(read(0)).toBe("2026-08-01");
  });

  it("advances as the document scrolls — the bug this replaces never moved", () => {
    // Second block starts at 520; it passes the 68+12 line once 440px have scrolled.
    expect(read(439)).toBe("2026-08-01");
    expect(read(441)).toBe("2026-09-01");
  });

  it("reports a middle month", () => {
    expect(read(700)).toBe("2026-09-01");
    expect(read(800)).toBe("2026-10-01");
  });

  it("does not fall back a month while a boundary rests on the line", () => {
    const onTheLine = MONTHS.map((month, position) => ({
      month,
      top: position === 1 ? MOBILE_STICKY_OFFSET : position * BLOCK,
    }));
    expect(
      pickVisibleMonth(
        onTheLine,
        monthReadThreshold({ mode: "document", paneTop: 0 }),
        MONTHS[0],
      ),
    ).toBe("2026-09-01");
  });
});

describe("pickVisibleMonth on a container-scrolled pane", () => {
  const paneTop = 180;
  const read = (paneScrollTop: number) =>
    pickVisibleMonth(
      sectionsInPane(paneTop, paneScrollTop),
      monthReadThreshold({ mode: "container", paneTop }),
      MONTHS[0],
    );

  it("reports first and middle months from their section positions", () => {
    expect(read(0)).toBe("2026-08-01");
    expect(read(330)).toBe("2026-09-01");
    expect(read(700)).toBe("2026-10-01");
  });

  it("holds the first month until the second block reaches the pane's top", () => {
    expect(read(BLOCK - MONTH_READ_SLACK - 2)).toBe("2026-08-01");
    expect(read(BLOCK - MONTH_READ_SLACK + 2)).toBe("2026-09-01");
  });

  it("ignores the sticky chrome, which is not above a pane that scrolls itself", () => {
    // Same geometry read in document coordinates would answer differently; the two
    // systems must not be mixed.
    expect(read(400)).not.toBe(
      pickVisibleMonth(
        sectionsInPane(paneTop, 400),
        monthReadThreshold({ mode: "document", paneTop }),
        MONTHS[0],
      ),
    );
  });

  it("falls back when the stream has no months", () => {
    expect(pickVisibleMonth([], 100, "2026-08-01")).toBe("2026-08-01");
  });
});

describe("attainable end-of-stream detection", () => {
  it("recognises a container clamped at its maximum scroll position", () => {
    expect(
      containerStreamAtEnd({
        scrollTop: 680,
        clientHeight: 600,
        scrollHeight: 1280,
      }),
    ).toBe(true);
    expect(
      containerStreamAtEnd({
        scrollTop: 650,
        clientHeight: 600,
        scrollHeight: 1280,
      }),
    ).toBe(false);
  });

  it("recognises when a document-scrolled stream bottom reaches the viewport", () => {
    expect(
      documentStreamAtEnd({ streamBottom: 799.5, viewportHeight: 800 }),
    ).toBe(true);
    expect(
      documentStreamAtEnd({ streamBottom: 820, viewportHeight: 800 }),
    ).toBe(false);
  });
});

describe("jump offsets", () => {
  it("puts a month's first row at the top of a scrolling pane", () => {
    expect(containerScrollTop(1280)).toBe(1280);
  });

  it("never asks a pane for a negative offset", () => {
    expect(containerScrollTop(-4)).toBe(0);
  });

  it("lands a document jump below the sticky header rather than behind it", () => {
    // The month is 600px down the viewport, 1000px into the document: 1600 absolute,
    // minus the chrome it must clear.
    expect(documentScrollTop({ sectionTop: 600, scrollY: 1000 })).toBe(
      1600 - MOBILE_STICKY_OFFSET,
    );
  });

  it("jumps backwards to a month already above the viewport", () => {
    expect(documentScrollTop({ sectionTop: -900, scrollY: 1000 })).toBe(
      100 - MOBILE_STICKY_OFFSET,
    );
  });

  it("clamps at the top of the document for the first month", () => {
    // The first month sits above the offset, so the honest target is negative and the
    // page simply goes to the top.
    expect(documentScrollTop({ sectionTop: 40, scrollY: 0 })).toBe(0);
  });

  it("is the offset a plain scrollIntoView would have missed", () => {
    // `block: "start"` targets `sectionTop + scrollY`; the difference is exactly the
    // chrome the month was disappearing behind.
    const target = documentScrollTop({ sectionTop: 600, scrollY: 1000 });
    expect(600 + 1000 - target).toBe(MOBILE_STICKY_OFFSET);
  });
});
