import { describe, expect, it } from "vitest";

/**
 * #16: the answer window can never outlast the stay it is about.
 *
 * A host used to get a flat 24 hours whatever the dates said, so a request made at
 * 23:00 for a stay starting that same day stayed acceptable until 23:00 the *next* day.
 * Accepting it confirmed a guest into a stay already underway — and `cancelBooking`
 * refuses guest cancellation of a CONFIRMED booking once `checkIn <= today`, so that
 * guest never had a single moment in which self-service cancellation existed.
 *
 * Same-day booking is still allowed. What is bounded is the answer.
 */
import {
  BOOKING_RESPONSE_WINDOW_HOURS,
  DEFAULT_CHECK_IN_TIME,
  bookingAcceptanceCutoff,
  bookingResponseDueAt,
  bookingResponseWindowIsOpen,
  checkInTimeForBooking,
} from "@/lib/services/booking-response-window";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import { zonedTimeToInstant } from "@/lib/utils/date-only";

/** A stored snapshot, built the same way `createBooking` builds the one it freezes. */
function snapshotWithCheckIn(checkInTime: string | null) {
  return houseRulesSnapshot({
    checkInTime,
    checkOutTime: "11:00",
    maxGuests: 4,
    petPolicy: null,
    smokingPolicy: null,
    eventPolicy: null,
    quietHoursPolicy: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    additionalRules: null,
  });
}

/** A `@db.Date` column as Prisma reads it back: UTC midnight on that calendar day. */
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe("check-in time for a booking", () => {
  it("reads the frozen snapshot rather than any current listing value", () => {
    expect(
      checkInTimeForBooking({
        checkIn: dbDate("2026-09-10"),
        houseRulesSnapshot: snapshotWithCheckIn("18:00"),
      }),
    ).toBe("18:00");
  });

  it("falls back to the default for every booking that carries no usable time", () => {
    // No snapshot at all: a legacy row, or a request taken without a rules acceptance
    // (the snapshot is only written alongside `houseRulesAcceptedAt`).
    expect(checkInTimeForBooking({ checkIn: dbDate("2026-09-10") })).toBe(
      DEFAULT_CHECK_IN_TIME,
    );
    // A host who left arrival flexible stores null.
    expect(
      checkInTimeForBooking({
        checkIn: dbDate("2026-09-10"),
        houseRulesSnapshot: snapshotWithCheckIn(null),
      }),
    ).toBe(DEFAULT_CHECK_IN_TIME);
    // Anything that is not a wall-clock time is not a rule either.
    expect(
      checkInTimeForBooking({
        checkIn: dbDate("2026-09-10"),
        houseRulesSnapshot: { version: 1, maxGuests: 4, checkInTime: "afternoon" },
      }),
    ).toBe(DEFAULT_CHECK_IN_TIME);
  });
});

describe("acceptance cutoff", () => {
  it("is the arrival wall time on the check-in day, in the marketplace zone", () => {
    expect(
      bookingAcceptanceCutoff({
        checkIn: dbDate("2026-09-10"),
        houseRulesSnapshot: snapshotWithCheckIn("16:30"),
      }).toISOString(),
    ).toBe(zonedTimeToInstant("2026-09-10", "16:30").toISOString());
  });

  /**
   * The trap this module exists to avoid: UTC midnight is *not* the start of the stay.
   * Reading `checkIn` as an instant would close the window hours early in a UTC+2 zone.
   */
  it("is not UTC midnight on the check-in date", () => {
    const cutoff = bookingAcceptanceCutoff({
      checkIn: dbDate("2026-09-10"),
      houseRulesSnapshot: snapshotWithCheckIn("15:00"),
    });
    expect(cutoff.getTime()).toBeGreaterThan(dbDate("2026-09-10").getTime());
  });
});

describe("response deadline", () => {
  it("gives the ordinary window when the stay is far enough away", () => {
    const createdAt = new Date("2026-09-01T09:00:00.000Z");
    expect(
      bookingResponseDueAt({
        createdAt,
        checkIn: dbDate("2026-09-20"),
        houseRulesSnapshot: snapshotWithCheckIn("15:00"),
      }).toISOString(),
    ).toBe(
      new Date(
        createdAt.getTime() + BOOKING_RESPONSE_WINDOW_HOURS * 3_600_000,
      ).toISOString(),
    );
  });

  /**
   * The failure case from the audit, to the hour: a request for a stay starting that
   * same day. The old rule made this answerable until the same time tomorrow.
   */
  it("clamps a same-day request to the stay's own arrival instant", () => {
    const createdAt = zonedTimeToInstant("2026-09-10", "09:00");
    const due = bookingResponseDueAt({
      createdAt,
      checkIn: dbDate("2026-09-10"),
      houseRulesSnapshot: snapshotWithCheckIn("15:00"),
    });
    expect(due.toISOString()).toBe(
      zonedTimeToInstant("2026-09-10", "15:00").toISOString(),
    );
    expect(due.getTime()).toBeLessThan(
      createdAt.getTime() + BOOKING_RESPONSE_WINDOW_HOURS * 3_600_000,
    );
  });

  /** A next-day stay is clamped too: 24 hours would reach past its arrival. */
  it("clamps a next-day request whose 24 hours would outlast the stay's start", () => {
    const createdAt = zonedTimeToInstant("2026-09-09", "20:00");
    expect(
      bookingResponseDueAt({
        createdAt,
        checkIn: dbDate("2026-09-10"),
        houseRulesSnapshot: snapshotWithCheckIn("15:00"),
      }).toISOString(),
    ).toBe(zonedTimeToInstant("2026-09-10", "15:00").toISOString());
  });

  /** Never later than the cutoff, so the stored column alone drives the expiry sweep. */
  it("is never later than the cutoff, whatever the arrival time", () => {
    for (const time of ["00:00", "08:00", "15:00", "23:59"]) {
      const createdAt = zonedTimeToInstant("2026-09-10", "07:00");
      const snapshot = snapshotWithCheckIn(time);
      const due = bookingResponseDueAt({
        createdAt,
        checkIn: dbDate("2026-09-11"),
        houseRulesSnapshot: snapshot,
      });
      expect(due.getTime()).toBeLessThanOrEqual(
        bookingAcceptanceCutoff({
          checkIn: dbDate("2026-09-11"),
          houseRulesSnapshot: snapshot,
        }).getTime(),
      );
    }
  });
});

describe("whether the window is still open", () => {
  const snapshot = snapshotWithCheckIn("15:00");
  const checkIn = dbDate("2026-09-10");

  it("is open before both the deadline and the arrival instant", () => {
    expect(
      bookingResponseWindowIsOpen(
        {
          checkIn,
          houseRulesSnapshot: snapshot,
          responseDueAt: zonedTimeToInstant("2026-09-10", "15:00"),
        },
        zonedTimeToInstant("2026-09-10", "14:00"),
      ),
    ).toBe(true);
  });

  it("is closed once the stored deadline has passed", () => {
    expect(
      bookingResponseWindowIsOpen(
        {
          checkIn,
          houseRulesSnapshot: snapshot,
          responseDueAt: zonedTimeToInstant("2026-09-09", "10:00"),
        },
        zonedTimeToInstant("2026-09-09", "11:00"),
      ),
    ).toBe(false);
  });

  /**
   * The legacy row. Created before the deadline was clamped, so it still carries
   * `createdAt + 24h` — a deadline that has *not* passed even though the stay started
   * hours ago. Without the second half of the test this row is still acceptable, and no
   * migration rewrites it.
   */
  it("is closed for a legacy row whose unclamped deadline outlasts the stay", () => {
    expect(
      bookingResponseWindowIsOpen(
        {
          checkIn,
          houseRulesSnapshot: snapshot,
          // 23:00 the day before, plus 24h, exactly as the old rule computed it.
          responseDueAt: zonedTimeToInstant("2026-09-10", "23:00"),
        },
        zonedTimeToInstant("2026-09-10", "18:00"),
      ),
    ).toBe(false);
  });

  it("closes exactly at the arrival instant, not a moment after", () => {
    const arrival = zonedTimeToInstant("2026-09-10", "15:00");
    expect(
      bookingResponseWindowIsOpen(
        { checkIn, houseRulesSnapshot: snapshot, responseDueAt: arrival },
        new Date(arrival.getTime() - 1),
      ),
    ).toBe(true);
    expect(
      bookingResponseWindowIsOpen(
        { checkIn, houseRulesSnapshot: snapshot, responseDueAt: arrival },
        arrival,
      ),
    ).toBe(false);
  });
});
