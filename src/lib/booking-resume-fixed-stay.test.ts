import { afterEach, describe, expect, it } from "vitest";
import {
  BOOKING_RESUME_STORAGE_KEY,
  parseBookingResumeDraft,
  takeBookingResumeDraft,
  writeBookingResumeDraft,
} from "./booking-resume";
import { findSelectableFixedStayOption } from "./fixed-stay-options";
import type { GuestFixedStayOption } from "./fixed-stay-options";

/**
 * The fixed-stay half of the sign-in round trip.
 *
 * The chosen stay travels in browser storage rather than on the return URL, because a
 * fixed stay is not a date range and putting its dates on the URL would let them come
 * back as an arbitrary selection this listing cannot make. What comes back is an id, and
 * an id is only worth anything after it has been re-checked against what the host is
 * still offering — which is the pairing this file pins down.
 */

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

const now = 1_700_000_000_000;

const option = (
  id: string,
  selectable = true,
): GuestFixedStayOption => ({
  id,
  checkIn: "2029-06-09",
  checkOut: "2029-06-16",
  nights: 7,
  selectable,
});

describe("a draft carrying a fixed stay", () => {
  it("round-trips the chosen stay beside the note and the payment method", () => {
    const draft = {
      listingId: "listing-1",
      note: "Arriving late",
      paymentMethod: "CASH",
      fixedStayPeriodId: "period-1",
      savedAt: now,
    };
    expect(parseBookingResumeDraft(JSON.stringify(draft), now + 5_000)).toEqual(
      draft,
    );
  });

  it("writes and takes it back for the same listing", () => {
    installStorage();
    writeBookingResumeDraft({
      listingId: "listing-1",
      note: "",
      paymentMethod: null,
      fixedStayPeriodId: "period-1",
      savedAt: now,
    });
    expect(takeBookingResumeDraft("listing-1", now + 1_000)).toMatchObject({
      fixedStayPeriodId: "period-1",
    });
  });

  it("drops a draft belonging to another listing, stay and all", () => {
    installStorage();
    writeBookingResumeDraft({
      listingId: "listing-1",
      note: "",
      paymentMethod: null,
      fixedStayPeriodId: "period-1",
      savedAt: now,
    });
    expect(takeBookingResumeDraft("listing-2", now + 1_000)).toBeNull();
  });

  it("clears the draft as it is read, so a stay cannot resurface later", () => {
    const store = installStorage();
    writeBookingResumeDraft({
      listingId: "listing-1",
      note: "",
      paymentMethod: null,
      fixedStayPeriodId: "period-1",
      savedAt: now,
    });
    takeBookingResumeDraft("listing-1", now + 1_000);
    expect(store.has(BOOKING_RESUME_STORAGE_KEY)).toBe(false);
  });
});

describe("old flexible drafts", () => {
  it("still parse, with no stay attached", () => {
    // Exactly what a v1 draft written before fixed stays existed looks like.
    const legacy = {
      listingId: "listing-1",
      note: "Arriving late",
      paymentMethod: "BANK_TRANSFER_LOCAL_SEPA",
      savedAt: now,
    };
    expect(parseBookingResumeDraft(JSON.stringify(legacy), now + 5_000)).toEqual({
      ...legacy,
      fixedStayPeriodId: null,
    });
  });

  it("are still written by a flexible caller that passes no stay", () => {
    installStorage();
    writeBookingResumeDraft({
      listingId: "listing-1",
      note: "Note",
      paymentMethod: null,
      savedAt: now,
    });
    expect(takeBookingResumeDraft("listing-1", now + 1_000)).toEqual({
      listingId: "listing-1",
      note: "Note",
      paymentMethod: null,
      fixedStayPeriodId: null,
      savedAt: now,
    });
  });
});

describe("a stay id that is not worth restoring", () => {
  it("is discarded when it is not a string", () => {
    for (const bad of [42, {}, [], true, ""]) {
      const parsed = parseBookingResumeDraft(
        JSON.stringify({
          listingId: "listing-1",
          note: "",
          paymentMethod: null,
          fixedStayPeriodId: bad,
          savedAt: now,
        }),
        now,
      );
      expect(parsed?.fixedStayPeriodId).toBeNull();
    }
  });

  it("restores only a stay the host is still offering", () => {
    const options = [option("period-1"), option("period-2", false)];
    expect(findSelectableFixedStayOption(options, "period-1")?.id).toBe("period-1");
    // Booked while the guest was reading their email.
    expect(findSelectableFixedStayOption(options, "period-2")).toBeNull();
    // Deleted by the host, or never on this listing in the first place.
    expect(findSelectableFixedStayOption(options, "period-3")).toBeNull();
    // A listing that switched back to flexible has no options at all.
    expect(findSelectableFixedStayOption([], "period-1")).toBeNull();
  });

  it("is dropped along with the whole draft once it has expired", () => {
    const stale = JSON.stringify({
      listingId: "listing-1",
      note: "",
      paymentMethod: null,
      fixedStayPeriodId: "period-1",
      savedAt: now,
    });
    expect(parseBookingResumeDraft(stale, now + 2 * 60 * 60 * 1000)).toBeNull();
  });
});
