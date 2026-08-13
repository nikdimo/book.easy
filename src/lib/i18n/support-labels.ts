import type { Translator } from "@/lib/i18n/t";

type Resolver = Pick<Translator, "resolve">;

export function resolveSafetyCaseType(t: Resolver, value: string) {
  return value === "CLAIM"
    ? t.resolve("support.type.claim", "Claim")
    : t.resolve("support.type.report", "Report");
}

export function resolveSafetyCaseStatus(t: Resolver, value: string) {
  switch (value) {
    case "SUBMITTED": return t.resolve("support.status.submitted", "Submitted");
    case "UNDER_REVIEW": return t.resolve("support.status.under_review", "Under review");
    case "AWAITING_INFORMATION": return t.resolve("support.status.awaiting_information", "Awaiting information");
    case "RESOLVED": return t.resolve("support.status.resolved", "Resolved");
    case "REJECTED": return t.resolve("support.status.rejected", "Rejected");
    default: return { text: value.replaceAll("_", " "), translated: false };
  }
}

export function resolveClaimKind(t: Resolver, value: string | null | undefined) {
  switch (value) {
    case "EXPENSE": return t.resolve("support.claim.expense", "Extra expense");
    case "DAMAGE": return t.resolve("support.claim.damage", "Property damage or missing item");
    case "REFUND": return t.resolve("support.claim.refund", "Guest refund request");
    default: return t.resolve("support.claim.booking", "Booking claim");
  }
}

export function resolveClaimResponse(t: Resolver, value: string | null | undefined) {
  switch (value) {
    case "AWAITING_ADMIN": return t.resolve("support.response.awaiting_admin", "Awaiting admin");
    case "AWAITING_RECIPIENT": return t.resolve("support.response.awaiting_recipient", "Awaiting recipient");
    case "ACCEPTED": return t.resolve("support.response.accepted", "Accepted");
    case "COUNTERED": return t.resolve("support.response.countered", "Countered");
    case "REJECTED": return t.resolve("support.response.rejected", "Rejected");
    case "ESCALATED": return t.resolve("support.response.escalated", "Escalated");
    default: return t.resolve("support.response.awaiting_admin", "Awaiting admin");
  }
}
