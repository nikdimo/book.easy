import { describe, expect, it } from "vitest";
import {
  isStayWithinAvailabilityWindows,
  mergeAvailabilityWindows,
  windowsCoverStay,
} from "@/lib/utils/availability-windows";

/** Windows and stays are half-open [start, end), matching the `@db.Date` columns. */
const w = (startDate: string, endDate: string) => ({
  startDate: new Date(startDate),
  endDate: new Date(endDate),
});
const d = (value: string) => new Date(value);

describe("mergeAvailabilityWindows", () => {
  it("joins two windows that touch at a single day", () => {
    expect(
      mergeAvailabilityWindows([
        w("2030-06-01", "2030-06-15"),
        w("2030-06-15", "2030-06-30"),
      ]),
    ).toEqual([w("2030-06-01", "2030-06-30")]);
  });

  it("joins windows that overlap", () => {
    expect(
      mergeAvailabilityWindows([
        w("2030-06-01", "2030-06-20"),
        w("2030-06-10", "2030-06-30"),
      ]),
    ).toEqual([w("2030-06-01", "2030-06-30")]);
  });

  it("keeps windows separated by a real gap apart", () => {
    expect(
      mergeAvailabilityWindows([
        w("2030-06-01", "2030-06-15"),
        w("2030-06-16", "2030-06-30"),
      ]),
    ).toEqual([w("2030-06-01", "2030-06-15"), w("2030-06-16", "2030-06-30")]);
  });

  it("merges regardless of the order the rows arrive in", () => {
    expect(
      mergeAvailabilityWindows([
        w("2030-06-15", "2030-06-30"),
        w("2030-06-01", "2030-06-15"),
      ]),
    ).toEqual([w("2030-06-01", "2030-06-30")]);
  });

  it("swallows a window wholly inside another", () => {
    expect(
      mergeAvailabilityWindows([
        w("2030-06-01", "2030-06-30"),
        w("2030-06-10", "2030-06-12"),
      ]),
    ).toEqual([w("2030-06-01", "2030-06-30")]);
  });

  it("drops empty and inverted rows rather than bridging a gap with them", () => {
    expect(
      mergeAvailabilityWindows([
        w("2030-06-01", "2030-06-10"),
        w("2030-06-10", "2030-06-10"),
        w("2030-06-20", "2030-06-15"),
        w("2030-06-20", "2030-06-30"),
      ]),
    ).toEqual([w("2030-06-01", "2030-06-10"), w("2030-06-20", "2030-06-30")]);
  });

  it("does not mutate the rows it was handed", () => {
    const windows = [w("2030-06-01", "2030-06-15"), w("2030-06-15", "2030-06-30")];
    mergeAvailabilityWindows(windows);
    expect(windows[0].endDate).toEqual(d("2030-06-15"));
  });
});

describe("windowsCoverStay", () => {
  const touching = [w("2030-06-01", "2030-06-15"), w("2030-06-15", "2030-06-30")];

  it("covers a stay lying across two touching windows", () => {
    // The C3 case: the calendar drew this free, the server refused it.
    expect(windowsCoverStay(touching, d("2030-06-10"), d("2030-06-20"))).toBe(
      true,
    );
  });

  it("covers a stay that sits inside a single window", () => {
    expect(windowsCoverStay(touching, d("2030-06-02"), d("2030-06-05"))).toBe(
      true,
    );
  });

  it("refuses a stay crossing a real gap between windows", () => {
    const gapped = [
      w("2030-06-01", "2030-06-15"),
      w("2030-06-16", "2030-06-30"),
    ];
    expect(windowsCoverStay(gapped, d("2030-06-10"), d("2030-06-20"))).toBe(
      false,
    );
  });

  it("covers a stay ending exactly where the merged span ends", () => {
    expect(windowsCoverStay(touching, d("2030-06-20"), d("2030-06-30"))).toBe(
      true,
    );
  });

  it("covers a stay starting exactly where the merged span starts", () => {
    expect(windowsCoverStay(touching, d("2030-06-01"), d("2030-06-05"))).toBe(
      true,
    );
  });

  it("covers a stay running the full length of the merged span", () => {
    expect(windowsCoverStay(touching, d("2030-06-01"), d("2030-06-30"))).toBe(
      true,
    );
  });

  it("refuses a stay running one night past the end of the span", () => {
    expect(windowsCoverStay(touching, d("2030-06-25"), d("2030-07-01"))).toBe(
      false,
    );
  });

  it("refuses a stay starting one day before the span opens", () => {
    expect(windowsCoverStay(touching, d("2030-05-31"), d("2030-06-05"))).toBe(
      false,
    );
  });

  it("refuses a stay when the host has opened nothing", () => {
    expect(windowsCoverStay([], d("2030-06-10"), d("2030-06-20"))).toBe(false);
  });

  it("refuses a reversed range even inside an open window", () => {
    expect(windowsCoverStay(touching, d("2030-06-20"), d("2030-06-10"))).toBe(
      false,
    );
  });

  it("refuses a zero-night range even inside an open window", () => {
    expect(windowsCoverStay(touching, d("2030-06-10"), d("2030-06-10"))).toBe(
      false,
    );
  });

  it("bridges a run of three touching windows", () => {
    const chain = [
      w("2030-06-01", "2030-06-10"),
      w("2030-06-10", "2030-06-20"),
      w("2030-06-20", "2030-06-30"),
    ];
    expect(windowsCoverStay(chain, d("2030-06-05"), d("2030-06-25"))).toBe(true);
  });
});

describe("isStayWithinAvailabilityWindows", () => {
  it("ignores windows for an OPEN listing", () => {
    expect(
      isStayWithinAvailabilityWindows({
        availabilityMode: "OPEN",
        windows: [],
        checkIn: d("2030-06-10"),
        checkOut: d("2030-06-20"),
      }),
    ).toBe(true);
  });

  it("still refuses a reversed range on an OPEN listing", () => {
    expect(
      isStayWithinAvailabilityWindows({
        availabilityMode: "OPEN",
        windows: [],
        checkIn: d("2030-06-20"),
        checkOut: d("2030-06-10"),
      }),
    ).toBe(false);
  });

  it("requires coverage for a CLOSED listing", () => {
    expect(
      isStayWithinAvailabilityWindows({
        availabilityMode: "CLOSED",
        windows: [w("2030-06-01", "2030-06-15"), w("2030-06-15", "2030-06-30")],
        checkIn: d("2030-06-10"),
        checkOut: d("2030-06-20"),
      }),
    ).toBe(true);
  });

  it("refuses a CLOSED listing with no windows at all", () => {
    expect(
      isStayWithinAvailabilityWindows({
        availabilityMode: "CLOSED",
        windows: [],
        checkIn: d("2030-06-10"),
        checkOut: d("2030-06-20"),
      }),
    ).toBe(false);
  });
});
