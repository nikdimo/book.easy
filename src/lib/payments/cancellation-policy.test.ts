import { describe, expect, it } from "vitest";
import {
  calculateCancellationSettlement,
  cancellationIsFree,
  cancellationPolicySnapshot,
  parseCancellationPolicySnapshot,
} from "./cancellation-policy";

describe("cancellation policy", () => {
  it("treats the calendar-day deadline itself as free", () => {
    expect(cancellationIsFree({ checkIn: "2026-09-20", cancelledOn: "2026-09-13", freeDays: 7 })).toBe(true);
    expect(cancellationIsFree({ checkIn: "2026-09-20", cancelledOn: "2026-09-14", freeDays: 7 })).toBe(false);
  });

  it("refunds all accommodation money before the deadline", () => {
    expect(calculateCancellationSettlement({
      cancelledBy: "guest", checkIn: "2026-09-20", cancelledOn: "2026-09-10",
      freeDays: 7, advanceReceived: 100, accommodationBalanceReceived: 300,
      damageDepositReceived: true,
    })).toEqual({
      accommodationRefundAmount: 400,
      retainableAdvanceAmount: 0,
      damageDepositReturnRequired: true,
      freeCancellation: true,
      // No provenance supplied means "all of it was confirmed", which is the honest
      // reading for a caller that has none to offer.
      confirmedRefundAmount: 400,
      refundBasis: "CONFIRMED",
      depositReturnBasis: "CONFIRMED",
    });
  });

  it("allows only the received advance to be retained after the deadline", () => {
    expect(calculateCancellationSettlement({
      cancelledBy: "guest", checkIn: "2026-09-20", cancelledOn: "2026-09-19",
      freeDays: 7, advanceReceived: 100, accommodationBalanceReceived: 300,
      damageDepositReceived: false,
    })).toMatchObject({ accommodationRefundAmount: 300, retainableAdvanceAmount: 100 });
  });

  it("requires a full refund when the host or admin cancels", () => {
    for (const cancelledBy of ["host", "admin"] as const) {
      expect(calculateCancellationSettlement({
        cancelledBy, checkIn: "2026-09-20", cancelledOn: "2026-09-19", freeDays: 7,
        advanceReceived: 100, accommodationBalanceReceived: 300, damageDepositReceived: false,
      }).accommodationRefundAmount).toBe(400);
    }
  });

  it("does not invent a policy for an unreviewed listing", () => {
    const snapshot = cancellationPolicySnapshot(null, null);
    expect(snapshot.status).toBe("UNANSWERED");
    expect(parseCancellationPolicySnapshot(snapshot)).toEqual(snapshot);
  });
});
