export const PAYMENT_METHOD_CODES = [
  "CASH_AT_PROPERTY",
  "BANK_TRANSFER_LOCAL_SEPA",
  "BANK_TRANSFER_INTERNATIONAL",
  "PAYPAL",
  "REVOLUT",
  "WISE",
  "HOST_SECURE_CARD_LINK",
  "OTHER",
  "ARRANGE_DIRECTLY",
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

export type PaymentArrangementsDraft = {
  methodCodes: PaymentMethodCode[];
  otherLabel: string | null;
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

// These checks are deliberately conservative client-side guidance, not the security
// boundary. The integrating server action remains responsible for authoritative
// validation before anything becomes public.
const EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const URL = /(?:https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.[a-z]{2,24}(?:\b|\/))/i;
const PHONE = /(?:^|\D)(?:\+?\d[\s().-]*){7,}(?:$|\D)/;
const HANDLE = /(?:^|\s)@[a-z0-9_.-]{2,}\b/i;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i;
const SWIFT = /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/;
const CRYPTO_ADDRESS = /\b(?:0x[a-f0-9]{40}|bc1[a-z0-9]{20,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/i;
const SENSITIVE_TERMS =
  /\b(?:account\s*(?:number|no\.?|details?)|iban|swift|bic|routing\s*(?:number|no\.?|code)|sort\s*code|bank\s*details?|wallet\s*address|payment\s*(?:handle|link)|card\s*(?:number|details?)|reference\s*(?:number|code))\b/i;
const LONG_NUMBER = /(?:^|\D)\d(?:[\s-]*\d){7,}(?:$|\D)/;
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
  if (length < 2) return "too_short";
  if (
    EMAIL.test(value) ||
    URL.test(value) ||
    PHONE.test(value) ||
    HANDLE.test(value) ||
    IBAN.test(value.replace(/[\s-]/g, "")) ||
    SWIFT.test(value) ||
    CRYPTO_ADDRESS.test(value) ||
    SENSITIVE_TERMS.test(value) ||
    LONG_NUMBER.test(value)
  ) {
    return "contact_or_payment_details";
  }
  if (INSTRUCTION.test(value)) return "payment_instructions";
  if (length > 40) return "too_long";
  return null;
}

export function paymentArrangementsAreComplete(draft: PaymentArrangementsDraft): boolean {
  const methodCodes = normalizePaymentMethodCodes(draft.methodCodes);
  if (methodCodes.length === 0) return false;
  if (methodCodes.includes("OTHER")) {
    return validateOtherPaymentLabel(draft.otherLabel ?? "") === null;
  }
  return true;
}

export function samePaymentArrangementsDraft(
  left: PaymentArrangementsDraft,
  right: PaymentArrangementsDraft,
): boolean {
  const normalizedLeft = normalizePaymentArrangementsDraft(left);
  const normalizedRight = normalizePaymentArrangementsDraft(right);
  return (
    normalizedLeft.otherLabel === normalizedRight.otherLabel &&
    normalizedLeft.methodCodes.length === normalizedRight.methodCodes.length &&
    normalizedLeft.methodCodes.every((code, index) => code === normalizedRight.methodCodes[index])
  );
}
