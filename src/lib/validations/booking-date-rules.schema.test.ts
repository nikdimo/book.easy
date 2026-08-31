import { afterAll, describe, expect, it } from "vitest";
import { createBookingSchema } from "@/lib/validations/booking.schema";
import { addDaysToYmd, todayYmd } from "@/lib/utils/date-only";
import {
  stayLengthCap,
  validateBookingSelection,
} from "@/lib/utils/booking-selection";
import { parseLocalYmd } from "@/lib/utils/stay-pricing";

/**
 * M6: the date a booking request is measured against.
 *
 * `createBookingSchema` used to floor check-in at `format(new Date(), "yyyy-MM-dd")` —
 * the *host process's* calendar day. The browser's picker has always offered the
 * marketplace's day (`todayYmd`), so on a UTC container the two disagreed for the first
 * one or two hours of every Skopje morning: the guest was shown today as selectable and
 * the server refused it as past.
 */
const ZONES = ["UTC", "Europe/Skopje", "America/Chicago", "Pacific/Kiritimati"];

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function inZone<T>(zone: string, body: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return body();
  } finally {
    process.env.TZ = previous;
  }
}

const HOUSE_RULES_VERSION = "a".repeat(64);

function request(checkIn: string, checkOut: string) {
  return {
    listingId: "listing-1",
    checkIn,
    checkOut,
    adults: "2",
    houseRulesAccepted: "true",
    houseRulesVersion: HOUSE_RULES_VERSION,
  };
}

const checkInError = (result: ReturnType<typeof createBookingSchema.safeParse>) =>
  result.success
    ? null
    : (result.error.issues.find((issue) => issue.path[0] === "checkIn")?.message ??
      null);

describe("a booking request's check-in date", () => {
  it("accepts today and refuses yesterday, in every server zone", () => {
    for (const zone of ZONES) {
      inZone(zone, () => {
        // Resolved inside the zone, so a schema that read the process clock would be
        // comparing against a different day here than the one it is asserted about.
        const today = todayYmd();

        expect(
          createBookingSchema.safeParse(request(today, addDaysToYmd(today, 2)))
            .success,
          `today should be bookable in ${zone}`,
        ).toBe(true);

        const yesterday = addDaysToYmd(today, -1);
        expect(
          checkInError(
            createBookingSchema.safeParse(request(yesterday, addDaysToYmd(today, 2))),
          ),
          `yesterday should be refused in ${zone}`,
        ).toBe("Check-in date cannot be in the past");
      });
    }
  });

  it("accepts tomorrow and dates well ahead", () => {
    for (const zone of ZONES) {
      inZone(zone, () => {
        const today = todayYmd();
        expect(
          createBookingSchema.safeParse(
            request(addDaysToYmd(today, 1), addDaysToYmd(today, 3)),
          ).success,
        ).toBe(true);
        expect(
          createBookingSchema.safeParse(
            request(addDaysToYmd(today, 300), addDaysToYmd(today, 303)),
          ).success,
        ).toBe(true);
      });
    }
  });

  it("agrees with the day the guest's own picker floors at", () => {
    // One rule, read the same way on both sides — which is the whole of M6 in this
    // one place. `todayYmd` is the browser's floor and now the server's too.
    const answers = ZONES.map((zone) => inZone(zone, () => todayYmd()));
    expect(new Set(answers).size).toBe(1);
  });

  it("still refuses a check-out that does not follow its check-in", () => {
    const today = todayYmd();
    const parsed = createBookingSchema.safeParse(request(today, today));
    expect(parsed.success).toBe(false);
    expect(
      parsed.success
        ? null
        : parsed.error.issues.find((issue) => issue.path[0] === "checkOut")?.message,
    ).toBe("Check-out date must be after check-in date");
  });
});

describe("stay length over a daylight-saving change", () => {
  /** Europe/Skopje puts the clocks back on 25 October 2026. */
  const autumnStay = () =>
    validateBookingSelection(
      parseLocalYmd("2026-10-24"),
      parseLocalYmd("2026-10-27"),
      3,
      [],
      3,
    );

  it("counts three nights, so a three-night minimum is met", () => {
    for (const zone of ZONES) {
      const result = inZone(zone, autumnStay);
      expect(result.nights, `nights in ${zone}`).toBe(3);
      expect(result.status, `status in ${zone}`).toBe("valid");
    }
  });

  it("counts three nights, so a three-night maximum is not exceeded", () => {
    for (const zone of ZONES) {
      const result = inZone(zone, () =>
        validateBookingSelection(
          parseLocalYmd("2026-03-28"),
          parseLocalYmd("2026-03-31"),
          1,
          [],
          3,
        ),
      );
      expect(result.nights, `nights in ${zone}`).toBe(3);
      expect(result.status, `status in ${zone}`).toBe("valid");
    }
  });

  it("still refuses the night that puts a stay over the cap", () => {
    for (const zone of ZONES) {
      const result = inZone(zone, () =>
        validateBookingSelection(
          parseLocalYmd("2026-10-24"),
          parseLocalYmd("2026-10-28"),
          1,
          [],
          3,
        ),
      );
      expect(result.nights).toBe(4);
      expect(result.status).toBe("maximum-stay");
    }
  });

  it("leaves the no-cap reading of `maxNights` alone", () => {
    expect(stayLengthCap(0)).toBeNull();
    expect(stayLengthCap(null)).toBeNull();
    expect(stayLengthCap(365)).toBe(365);
  });
});

describe("blocked nights in a selection", () => {
  const blocked = [{ from: "2026-06-12", to: "2026-06-13" }];

  it("refuses a stay whose nights touch a blocked run, in any zone", () => {
    for (const zone of ZONES) {
      const result = inZone(zone, () =>
        validateBookingSelection(
          parseLocalYmd("2026-06-11"),
          parseLocalYmd("2026-06-14"),
          1,
          blocked,
        ),
      );
      expect(result.status, `status in ${zone}`).toBe("unavailable");
    }
  });

  it("allows checking out on a blocked run's first day — that night is not slept", () => {
    for (const zone of ZONES) {
      const result = inZone(zone, () =>
        validateBookingSelection(
          parseLocalYmd("2026-06-10"),
          parseLocalYmd("2026-06-12"),
          1,
          blocked,
        ),
      );
      expect(result.status, `status in ${zone}`).toBe("valid");
      expect(result.nights).toBe(2);
    }
  });

  it("allows checking in the day after a blocked run ends", () => {
    for (const zone of ZONES) {
      const result = inZone(zone, () =>
        validateBookingSelection(
          parseLocalYmd("2026-06-14"),
          parseLocalYmd("2026-06-16"),
          1,
          blocked,
        ),
      );
      expect(result.status, `status in ${zone}`).toBe("valid");
    }
  });
});
