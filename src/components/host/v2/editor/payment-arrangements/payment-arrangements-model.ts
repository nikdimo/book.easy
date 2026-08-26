import {
  otherPaymentMethodLabelIssue,
  PAYMENT_METHOD_CODES as SHARED_PAYMENT_METHOD_CODES,
  type PaymentMethodCode as SharedPaymentMethodCode,
} from "@/lib/payments/payment-methods";
import {
  normalizePaymentInstructionTemplates,
  samePaymentInstructionTemplates,
  validatePaymentInstructionTemplates,
  type PaymentInstructionTemplateIssue,
  type PaymentInstructionTemplates,
} from "@/lib/payments/payment-instruction-templates";

/** Re-export the shared domain vocabulary so the editor cannot drift from the server. */
export const PAYMENT_METHOD_CODES = SHARED_PAYMENT_METHOD_CODES;
export type PaymentMethodCode = SharedPaymentMethodCode;

export type PaymentArrangementsDraft = {
  methodCodes: PaymentMethodCode[];
  otherLabel: string | null;
  instructionTemplates?: PaymentInstructionTemplates;
};

export type PaymentArrangementsValue = PaymentArrangementsDraft & {
  /** A null timestamp means the host has never deliberately answered this question. */
  reviewedAt: string | null;
};

export type OtherPaymentLabelIssue =
  | "required"
  | "too_short"
  | "too_long"
  | "contact_or_payment_details"
  | "payment_instructions";

const PAYMENT_METHOD_SET = new Set<string>(PAYMENT_METHOD_CODES);
const INSTRUCTION =
  /\b(?:(?:pay|send|transfer|wire|deposit)\s+(?:me|us|to|the|via|at|by|before|after|on)|(?:send|make)\s+(?:a\s+)?payment|(?:contact|message|call|email|text|whatsapp)\s+(?:me|us|the\s+host)|(?:use|enter|include)\s+(?:the\s+)?(?:reference|code)|cash\s+on\s+arrival)\b/i;

export function normalizePaymentMethodCodes(
  methodCodes: readonly PaymentMethodCode[],
): PaymentMethodCode[] {
  const unique = new Set(
    methodCodes.filter((code): code is PaymentMethodCode => PAYMENT_METHOD_SET.has(code)),
  );

  if (unique.has("ARRANGE_DIRECTLY")) return ["ARRANGE_DIRECTLY"];
  return PAYMENT_METHOD_CODES.filter((code) => unique.has(code));
}

export function normalizePaymentArrangementsDraft(
  draft: PaymentArrangementsDraft,
): PaymentArrangementsDraft {
  const methodCodes = normalizePaymentMethodCodes(draft.methodCodes);
  return {
    methodCodes,
    otherLabel: methodCodes.includes("OTHER") ? (draft.otherLabel ?? "").trim() : null,
    instructionTemplates: Object.fromEntries(
      Object.entries(normalizePaymentInstructionTemplates(draft.instructionTemplates)).filter(
        ([code]) => methodCodes.includes(code as PaymentMethodCode),
      ),
    ),
  };
}

/** Applies one checkbox change while keeping ARRANGE_DIRECTLY exclusive. */
export function togglePaymentMethod(
  current: readonly PaymentMethodCode[],
  code: PaymentMethodCode,
  checked: boolean,
): PaymentMethodCode[] {
  if (!checked) return normalizePaymentMethodCodes(current.filter((item) => item !== code));
  if (code === "ARRANGE_DIRECTLY") return [code];

  return normalizePaymentMethodCodes([
    ...current.filter((item) => item !== "ARRANGE_DIRECTLY"),
    code,
  ]);
}

export function validateOtherPaymentLabel(label: string): OtherPaymentLabelIssue | null {
  const value = label.trim();
  const length = Array.from(value).length;

  if (length === 0) return "required";
  if (INSTRUCTION.test(value)) return "payment_instructions";
  const issue = otherPaymentMethodLabelIssue(value);
  if (issue === "TOO_SHORT") return "too_short";
  if (issue === "TOO_LONG") return "too_long";
  return issue ? "contact_or_payment_details" : null;
}

export function paymentArrangementsAreComplete(draft: PaymentArrangementsDraft): boolean {
  const methodCodes = normalizePaymentMethodCodes(draft.methodCodes);
  if (methodCodes.length === 0) return false;
  if (methodCodes.includes("OTHER")) {
    if (validateOtherPaymentLabel(draft.otherLabel ?? "") !== null) return false;
  }
  const normalized = normalizePaymentArrangementsDraft(draft);
  return validatePaymentInstructionTemplates(
    normalized.instructionTemplates ?? {},
    methodCodes,
  ).success;
}

export function paymentInstructionTemplateIssue(
  draft: PaymentArrangementsDraft,
): PaymentInstructionTemplateIssue | null {
  const normalized = normalizePaymentArrangementsDraft(draft);
  const result = validatePaymentInstructionTemplates(
    normalized.instructionTemplates ?? {},
    normalized.methodCodes,
  );
  return result.success ? null : result.issue;
}

export function samePaymentArrangementsDraft(
  left: PaymentArrangementsDraft,
  right: PaymentArrangementsDraft,
): boolean {
  const normalizedLeft = normalizePaymentArrangementsDraft(left);
  const normalizedRight = normalizePaymentArrangementsDraft(right);
  return (
    normalizedLeft.otherLabel === normalizedRight.otherLabel &&
    samePaymentInstructionTemplates(
      normalizedLeft.instructionTemplates ?? {},
      normalizedRight.instructionTemplates ?? {},
    ) &&
    normalizedLeft.methodCodes.length === normalizedRight.methodCodes.length &&
    normalizedLeft.methodCodes.every((code, index) => code === normalizedRight.methodCodes[index])
  );
}
