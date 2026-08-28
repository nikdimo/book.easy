import { afterEach, describe, expect, it } from "vitest";
import {
  BOOKING_RESUME_STORAGE_KEY,
  BOOKING_RESUME_TTL_MS,
  parseBookingResumeDraft,
  takeBookingResumeDraft,
  writeBookingResumeDraft,
} from "./booking-resume";

/** The suite runs in the node environment, so the module's `window` guards would make
 *  every storage call a no-op. This is the smallest stand-in they accept. */
function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("parseBookingResumeDraft", () => {
  const now = 1_700_000_000_000;
  const draft = {
    listingId: "listing-1",
    note: "Arriving late",
    paymentMethod: "CASH",
    savedAt: now,
  };

  it("round-trips a draft written moments ago", () => {
    expect(parseBookingResumeDraft(JSON.stringify(draft), now + 5_000)).toEqual(
      draft,
    );
  });

  it("drops a draft older than the time-to-live", () => {
    expect(
      parseBookingResumeDraft(
        JSON.stringify(draft),
        now + BOOKING_RESUME_TTL_MS + 1,
      ),
    ).toBeNull();
  });

  it("drops a draft stamped in the future rather than letting it never expire", () => {
    expect(parseBookingResumeDraft(JSON.stringify(draft), now - 60_000)).toBeNull();
  });

  it("returns null for nothing, for junk, and for a draft with no listing", () => {
    expect(parseBookingResumeDraft(null)).toBeNull();
    expect(parseBookingResumeDraft("not json")).toBeNull();
    expect(parseBookingResumeDraft(JSON.stringify({ ...draft, listingId: "" }))).toBeNull();
    expect(parseBookingResumeDraft(JSON.stringify({ listingId: "x" }))).toBeNull();
  });

  it("fills in the optional halves a draft may have been written without", () => {
    expect(
      parseBookingResumeDraft(JSON.stringify({ listingId: "l", savedAt: now }), now),
    ).toEqual({ listingId: "l", note: "", paymentMethod: null, savedAt: now });
  });
});

describe("takeBookingResumeDraft", () => {
  it("hands the draft back once and clears it", () => {
    const store = installStorage();
    writeBookingResumeDraft({
      listingId: "listing-1",
      note: "Arriving late",
      paymentMethod: "CASH",
      savedAt: Date.now(),
    });

    expect(takeBookingResumeDraft("listing-1")?.note).toBe("Arriving late");
    expect(store.has(BOOKING_RESUME_STORAGE_KEY)).toBe(false);
    expect(takeBookingResumeDraft("listing-1")).toBeNull();
  });

  it("discards a draft left behind on another listing", () => {
    const store = installStorage();
    writeBookingResumeDraft({
      listingId: "listing-1",
      note: "Arriving late",
      paymentMethod: null,
      savedAt: Date.now(),
    });

    expect(takeBookingResumeDraft("listing-2")).toBeNull();
    expect(store.has(BOOKING_RESUME_STORAGE_KEY)).toBe(false);
  });

  it("is a no-op without a browser", () => {
    expect(takeBookingResumeDraft("listing-1")).toBeNull();
  });
});
