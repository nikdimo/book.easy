import { describe, expect, it } from "vitest";
import {
  calculateCancellationSettlement,
  parseCancellationSettlementSnapshot,
} from "./cancellation-policy";

/**
 * #2: what an unconfirmed `*_REPORTED` claim establishes.
 *
 * Two modules read the same status and disagreed about it. Cancellation settlement
 * counted `PAYMENT_REPORTED` as money received — opening `AWAITING_REFUND` with a
 * positive amount and sending the host escalating "refund due" notices — while the
 * reminder job refused to trust it and kept nudging the guest. One module trusted the
 * report enough to bill the host; the other did not trust it enough to stop nagging.
 *
 * The product answer recorded here is the third option: a claim is enough to **open** an
 * obligation (a guest must not lose a refund because their host stays silent) but the
 * obligation it opens is **provisional**, and the calculation records which it is so no
 * surface has to guess.
 */
describe("settlement provenance", () => {
  const base = {
    cancelledBy: "guest" as const,
    checkIn: "2026-09-20",
    cancelledOn: "2026-09-10",
    freeDays: 7,
  };

  it("still opens the full obligation when the money was only reported", () => {
    const settlement = calculateCancellationSettlement({
      ...base,
      advanceReceived: 100,
      advanceConfirmed: 0,
      accommodationBalanceReceived: 300,
      accommodationBalanceConfirmed: 0,
      damageDepositReceived: false,
    });
    // The guest keeps their refund: the amount is unchanged by the host's silence.
    expect(settlement.accommodationRefundAmount).toBe(400);
    // But nothing may call it established.
    expect(settlement.confirmedRefundAmount).toBe(0);
    expect(settlement.refundBasis).toBe("CLAIMED");
  });

  it("marks a settlement CONFIRMED when every amount was confirmed", () => {
    const settlement = calculateCancellationSettlement({
      ...base,
      advanceReceived: 100,
      advanceConfirmed: 100,
      accommodationBalanceReceived: 300,
      accommodationBalanceConfirmed: 300,
      damageDepositReceived: true,
      damageDepositConfirmed: true,
    });
    expect(settlement.refundBasis).toBe("CONFIRMED");
    expect(settlement.depositReturnBasis).toBe("CONFIRMED");
    expect(settlement.confirmedRefundAmount).toBe(400);
  });

  it("marks a partly-claimed settlement CLAIMED and says how much is confirmed", () => {
    // The advance was confirmed; the balance is only reported.
    const settlement = calculateCancellationSettlement({
      ...base,
      advanceReceived: 100,
      advanceConfirmed: 100,
      accommodationBalanceReceived: 300,
      accommodationBalanceConfirmed: 0,
      damageDepositReceived: false,
    });
    expect(settlement.accommodationRefundAmount).toBe(400);
    expect(settlement.confirmedRefundAmount).toBe(100);
    expect(settlement.refundBasis).toBe("CLAIMED");
  });

  it("does not credit a retention against money the host never confirmed", () => {
    // A late guest cancellation: the host may retain the advance they received. Against
    // an *unconfirmed* advance there is nothing confirmed to retain, and nothing
    // confirmed to refund either.
    const settlement = calculateCancellationSettlement({
      ...base,
      cancelledOn: "2026-09-19",
      advanceReceived: 100,
      advanceConfirmed: 0,
      accommodationBalanceReceived: 300,
      accommodationBalanceConfirmed: 300,
      damageDepositReceived: false,
    });
    expect(settlement.freeCancellation).toBe(false);
    expect(settlement.retainableAdvanceAmount).toBe(100);
    expect(settlement.accommodationRefundAmount).toBe(300);
    // The balance alone is confirmed, and the whole refund is covered by it.
    expect(settlement.confirmedRefundAmount).toBe(300);
    expect(settlement.refundBasis).toBe("CONFIRMED");
  });

  it("tracks the deposit-return obligation's basis separately from the refund's", () => {
    const settlement = calculateCancellationSettlement({
      ...base,
      advanceReceived: 100,
      advanceConfirmed: 100,
      accommodationBalanceReceived: 0,
      accommodationBalanceConfirmed: 0,
      damageDepositReceived: true,
      damageDepositConfirmed: false,
    });
    expect(settlement.refundBasis).toBe("CONFIRMED");
    expect(settlement.depositReturnBasis).toBe("CLAIMED");
  });

  it("never reports more confirmed than the obligation itself", () => {
    const settlement = calculateCancellationSettlement({
      ...base,
      advanceReceived: 0,
      advanceConfirmed: 500,
      accommodationBalanceReceived: 100,
      accommodationBalanceConfirmed: 900,
      damageDepositReceived: false,
    });
    expect(settlement.confirmedRefundAmount).toBeLessThanOrEqual(
      settlement.accommodationRefundAmount,
    );
  });
});

describe("stored settlement snapshots", () => {
  const v2 = {
    version: 2,
    calculatedAt: "2026-09-10T10:00:00.000Z",
    freeCancellation: true,
    accommodationRefundAmount: 400,
    retainableAdvanceAmount: 0,
    damageDepositReturnRequired: false,
    confirmedRefundAmount: 100,
    refundBasis: "CLAIMED",
    depositReturnBasis: "CONFIRMED",
  };

  it("reads a version-2 snapshot back with its provenance intact", () => {
    expect(parseCancellationSettlementSnapshot(v2)).toEqual(v2);
  });

  /**
   * The rows already in the database. They were written before provenance was recorded,
   * and some of them *were* built from an unconfirmed report — so reading them back as
   * "confirmed" would assert exactly the thing this distinction exists to stop.
   */
  it("reads a version-1 snapshot back as UNKNOWN, never as confirmed", () => {
    const parsed = parseCancellationSettlementSnapshot({
      version: 1,
      calculatedAt: "2026-05-01T10:00:00.000Z",
      freeCancellation: false,
      accommodationRefundAmount: 300,
      retainableAdvanceAmount: 100,
      damageDepositReturnRequired: true,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.refundBasis).toBe("UNKNOWN");
    expect(parsed?.depositReturnBasis).toBe("UNKNOWN");
    expect(parsed?.confirmedRefundAmount).toBe(0);
    // The amounts a version-1 row did carry still read back unchanged.
    expect(parsed?.accommodationRefundAmount).toBe(300);
    expect(parsed?.retainableAdvanceAmount).toBe(100);
  });

  it("refuses an unrecognised version rather than reading it partially", () => {
    expect(parseCancellationSettlementSnapshot({ ...v2, version: 3 })).toBeNull();
  });

  it("clamps a stored confirmed amount that exceeds the obligation", () => {
    expect(
      parseCancellationSettlementSnapshot({ ...v2, confirmedRefundAmount: 9999 })
        ?.confirmedRefundAmount,
    ).toBe(400);
  });

  it("treats an unrecognised basis value as UNKNOWN", () => {
    expect(
      parseCancellationSettlementSnapshot({ ...v2, refundBasis: "PROBABLY" })
        ?.refundBasis,
    ).toBe("UNKNOWN");
  });
});
