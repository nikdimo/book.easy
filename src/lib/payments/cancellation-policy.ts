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

export interface CancellationSettlement {
  accommodationRefundAmount: number;
  retainableAdvanceAmount: number;
  damageDepositReturnRequired: boolean;
  freeCancellation: boolean;
}

export interface CancellationSettlementSnapshotV1 extends CancellationSettlement {
  version: 1;
  calculatedAt: string;
}

export function parseCancellationSettlementSnapshot(
  input: unknown,
): CancellationSettlementSnapshotV1 | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (
    raw.version !== 1 ||
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
  return {
    version: 1,
    calculatedAt: raw.calculatedAt,
    freeCancellation: raw.freeCancellation,
    accommodationRefundAmount,
    retainableAdvanceAmount,
    damageDepositReturnRequired: raw.damageDepositReturnRequired,
  };
}

/** Calculates obligations only. It never claims a refund, return or retention happened. */
export function calculateCancellationSettlement(input: {
  cancelledBy: "guest" | "host" | "admin";
  checkIn: Date | string;
  cancelledOn: string;
  freeDays: number;
  advanceReceived: number;
  accommodationBalanceReceived: number;
  damageDepositReceived: boolean;
}): CancellationSettlement {
  const advanceReceived = Math.max(0, input.advanceReceived);
  const balanceReceived = Math.max(0, input.accommodationBalanceReceived);
  const freeCancellation =
    input.cancelledBy !== "guest" ||
    cancellationIsFree({
      checkIn: input.checkIn,
      cancelledOn: input.cancelledOn,
      freeDays: input.freeDays,
    });
  const retainableAdvanceAmount = freeCancellation ? 0 : advanceReceived;
  return {
    accommodationRefundAmount:
      balanceReceived + advanceReceived - retainableAdvanceAmount,
    retainableAdvanceAmount,
    damageDepositReturnRequired: input.damageDepositReceived,
    freeCancellation,
  };
}
