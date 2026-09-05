import { addDaysToYmd, compareYmd, dbDateToYmd } from "@/lib/utils/date-only";

export const MAX_FREE_CANCELLATION_DAYS = 3650;

export interface CancellationPolicySnapshotV1 {
  version: 1;
  status: "REVIEWED" | "UNANSWERED";
  freeCancellationDaysBeforeCheckIn: number | null;
}

export function validateCancellationPolicy(input: unknown):
  | { success: true; value: number }
  | { success: false; issue: "REQUIRED" | "INVALID" } {
  if (input === "" || input === null || input === undefined) {
    return { success: false, issue: "REQUIRED" };
  }
  const value = typeof input === "number" ? input : Number(String(input).trim());
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_FREE_CANCELLATION_DAYS
  ) {
    return { success: false, issue: "INVALID" };
  }
  return { success: true, value };
}

export function cancellationPolicySnapshot(
  days: number | null | undefined,
  reviewedAt: Date | null | undefined,
): CancellationPolicySnapshotV1 {
  const validated = validateCancellationPolicy(days);
  return reviewedAt && validated.success
    ? {
        version: 1,
        status: "REVIEWED",
        freeCancellationDaysBeforeCheckIn: validated.value,
      }
    : {
        version: 1,
        status: "UNANSWERED",
        freeCancellationDaysBeforeCheckIn: null,
      };
}

export function parseCancellationPolicySnapshot(
  input: unknown,
): CancellationPolicySnapshotV1 | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1) return null;
  if (raw.status === "UNANSWERED" && raw.freeCancellationDaysBeforeCheckIn === null) {
    return {
      version: 1,
      status: "UNANSWERED",
      freeCancellationDaysBeforeCheckIn: null,
    };
  }
  if (raw.status !== "REVIEWED") return null;
  const validated = validateCancellationPolicy(
    raw.freeCancellationDaysBeforeCheckIn,
  );
  return validated.success
    ? {
        version: 1,
        status: "REVIEWED",
        freeCancellationDaysBeforeCheckIn: validated.value,
      }
    : null;
}

export function cancellationDeadlineYmd(
  checkIn: Date | string,
  freeDays: number,
): string {
  return addDaysToYmd(dbDateToYmd(checkIn), -freeDays);
}

export function cancellationIsFree(input: {
  checkIn: Date | string;
  cancelledOn: string;
  freeDays: number;
}): boolean {
  return compareYmd(
    input.cancelledOn,
    cancellationDeadlineYmd(input.checkIn, input.freeDays),
  ) <= 0;
}

/**
 * Where an obligation's money came from - the distinction the whole "reported vs
 * confirmed" question turns on.
 *
 * `PAYMENT_REPORTED` and `DEPOSIT_REPORTED` are, by the state machine's own definition,
 * *one side's own claim*: the guest said they sent money and the host has not confirmed
 * receiving it. A settlement built on such a claim opens a real obligation - a guest
 * whose host simply never confirms must not lose their refund - but it is not an
 * established debt, and nothing may present it as one.
 *
 * - `CONFIRMED` - every amount counted as received was confirmed by the receiving side.
 * - `CLAIMED` - some or all of it rests on an unconfirmed report. Provisional.
 * - `UNKNOWN` - a snapshot written before this distinction was recorded. Not evidence of
 *   either; a caller that needs proof of confirmed money must treat it as not proven.
 */
export type SettlementBasis = "CONFIRMED" | "CLAIMED" | "UNKNOWN";

export interface CancellationSettlement {
  accommodationRefundAmount: number;
  retainableAdvanceAmount: number;
  damageDepositReturnRequired: boolean;
  freeCancellation: boolean;
  /**
   * How much of `accommodationRefundAmount` rests on money the host actually confirmed
   * receiving. Never greater than the refund amount, and equal to it when nothing about
   * the settlement is merely claimed.
   */
  confirmedRefundAmount: number;
  /** `CLAIMED` when any part of the refund rests on an unconfirmed report. */
  refundBasis: SettlementBasis;
  /** `CLAIMED` when the deposit-return obligation rests on an unconfirmed report. */
  depositReturnBasis: SettlementBasis;
}

/**
 * The stored calculation.
 *
 * Version 2 adds the provenance fields above. Version 1 rows are still read - they
 * predate the distinction, so they come back as `UNKNOWN` with `confirmedRefundAmount`
 * left at zero rather than being assumed confirmed. Nothing rewrites a stored snapshot.
 */
export interface CancellationSettlementSnapshotV1 extends CancellationSettlement {
  version: 1 | 2;
  calculatedAt: string;
}

export function parseCancellationSettlementSnapshot(
  input: unknown,
): CancellationSettlementSnapshotV1 | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (
    (raw.version !== 1 && raw.version !== 2) ||
    typeof raw.calculatedAt !== "string" ||
    Number.isNaN(Date.parse(raw.calculatedAt)) ||
    typeof raw.freeCancellation !== "boolean" ||
    typeof raw.damageDepositReturnRequired !== "boolean"
  ) {
    return null;
  }
  const accommodationRefundAmount = Number(raw.accommodationRefundAmount);
  const retainableAdvanceAmount = Number(raw.retainableAdvanceAmount);
  if (
    !Number.isFinite(accommodationRefundAmount) ||
    accommodationRefundAmount < 0 ||
    !Number.isFinite(retainableAdvanceAmount) ||
    retainableAdvanceAmount < 0
  ) {
    return null;
  }
  const confirmedRefundAmount = Number(raw.confirmedRefundAmount);
  return {
    version: raw.version,
    calculatedAt: raw.calculatedAt,
    freeCancellation: raw.freeCancellation,
    accommodationRefundAmount,
    retainableAdvanceAmount,
    damageDepositReturnRequired: raw.damageDepositReturnRequired,
    // A version-1 row said nothing about provenance, and inventing "confirmed" for it
    // would be exactly the assertion this distinction exists to prevent.
    confirmedRefundAmount:
      Number.isFinite(confirmedRefundAmount) && confirmedRefundAmount >= 0
        ? Math.min(confirmedRefundAmount, accommodationRefundAmount)
        : 0,
    refundBasis: settlementBasis(raw.refundBasis),
    depositReturnBasis: settlementBasis(raw.depositReturnBasis),
  };
}

function settlementBasis(value: unknown): SettlementBasis {
  return value === "CONFIRMED" || value === "CLAIMED" ? value : "UNKNOWN";
}

/**
 * Calculates obligations only. It never claims a refund, return or retention happened.
 *
 * The `*Received` inputs are what the settlement is *built* from, and a guest's own
 * report counts among them - a host who never confirms must not be able to make a refund
 * obligation disappear by staying silent. The optional `*Confirmed` inputs say how much
 * of that the receiving side actually confirmed, which is what makes the resulting
 * obligation provisional or established. Omitting them means "the same as received",
 * which is the honest reading for a caller with no provenance to offer.
 */
export function calculateCancellationSettlement(input: {
  cancelledBy: "guest" | "host" | "admin";
  checkIn: Date | string;
  cancelledOn: string;
  freeDays: number;
  advanceReceived: number;
  accommodationBalanceReceived: number;
  damageDepositReceived: boolean;
  /** The confirmed part of `advanceReceived`. Defaults to all of it. */
  advanceConfirmed?: number;
  /** The confirmed part of `accommodationBalanceReceived`. Defaults to all of it. */
  accommodationBalanceConfirmed?: number;
  /** Whether the deposit receipt was confirmed. Defaults to `damageDepositReceived`. */
  damageDepositConfirmed?: boolean;
}): CancellationSettlement {
  const advanceReceived = Math.max(0, input.advanceReceived);
  const balanceReceived = Math.max(0, input.accommodationBalanceReceived);
  const advanceConfirmed = Math.min(
    advanceReceived,
    Math.max(0, input.advanceConfirmed ?? advanceReceived),
  );
  const balanceConfirmed = Math.min(
    balanceReceived,
    Math.max(0, input.accommodationBalanceConfirmed ?? balanceReceived),
  );
  const depositConfirmed =
    input.damageDepositConfirmed ?? input.damageDepositReceived;
  const freeCancellation =
    input.cancelledBy !== "guest" ||
    cancellationIsFree({
      checkIn: input.checkIn,
      cancelledOn: input.cancelledOn,
      freeDays: input.freeDays,
    });
  const retainableAdvanceAmount = freeCancellation ? 0 : advanceReceived;
  const accommodationRefundAmount =
    balanceReceived + advanceReceived - retainableAdvanceAmount;
  // The same arithmetic over the confirmed figures alone. The retention is measured
  // against the confirmed advance too: a host cannot be credited with retaining money
  // whose receipt they never confirmed.
  const confirmedRefundAmount = Math.min(
    accommodationRefundAmount,
    Math.max(
      0,
      balanceConfirmed +
        advanceConfirmed -
        (freeCancellation ? 0 : advanceConfirmed),
    ),
  );
  return {
    accommodationRefundAmount,
    retainableAdvanceAmount,
    damageDepositReturnRequired: input.damageDepositReceived,
    freeCancellation,
    confirmedRefundAmount,
    refundBasis:
      confirmedRefundAmount >= accommodationRefundAmount
        ? "CONFIRMED"
        : "CLAIMED",
    depositReturnBasis:
      !input.damageDepositReceived || depositConfirmed ? "CONFIRMED" : "CLAIMED",
  };
}
