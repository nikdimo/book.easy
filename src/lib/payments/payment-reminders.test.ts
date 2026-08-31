import { describe, expect, it } from "vitest";
import { derivePaymentReminderState } from "./payment-reminders";

describe("payment reminder states", () => {
  it("derives scheduled, due-soon, due-date and overdue from dates", () => {
    expect(derivePaymentReminderState({ dueDate: "2026-09-10", today: "2026-09-01" })).toBe("SCHEDULED");
    expect(derivePaymentReminderState({ dueDate: "2026-09-04", today: "2026-09-01" })).toBe("DUE_SOON");
    expect(derivePaymentReminderState({ dueDate: "2026-09-01", today: "2026-09-01" })).toBe("DUE_DATE");
    expect(derivePaymentReminderState({ dueDate: "2026-08-31", today: "2026-09-01" })).toBe("OVERDUE");
  });

  it("uses return-due for a return obligation that has reached its date", () => {
    expect(derivePaymentReminderState({
      dueDate: "2026-09-01",
      today: "2026-09-01",
      returnObligation: true,
    })).toBe("RETURN_DUE");
  });
});
