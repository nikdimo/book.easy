import { compareYmd } from "@/lib/utils/date-only";

export type PaymentReminderState =
  | "SCHEDULED"
  | "DUE_SOON"
  | "DUE_DATE"
  | "OVERDUE"
  | "RETURN_DUE";

/** Display/reminder state only. It never changes a settlement status. */
export function derivePaymentReminderState(input: {
  dueDate: string;
  today: string;
  returnObligation?: boolean;
}): PaymentReminderState {
  const comparison = compareYmd(input.dueDate, input.today);
  if (comparison < 0) return input.returnObligation ? "RETURN_DUE" : "OVERDUE";
  if (comparison === 0) return input.returnObligation ? "RETURN_DUE" : "DUE_DATE";
  const milliseconds =
    Date.parse(`${input.dueDate}T00:00:00.000Z`) -
    Date.parse(`${input.today}T00:00:00.000Z`);
  const days = Math.round(milliseconds / 86_400_000);
  return days <= 3 ? "DUE_SOON" : "SCHEDULED";
}
