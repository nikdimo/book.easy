import {
  PAYMENT_METHOD_CODES,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";
import { containsUnsafePaymentCredentials } from "@/lib/services/payment-instructions";

export const PAYMENT_INSTRUCTION_TEMPLATE_MAX_LENGTH = 1200;
export const PAYMENT_INSTRUCTION_TEMPLATES_TOTAL_MAX_LENGTH = 1200;

export type PaymentInstructionTemplates = Partial<
  Record<PaymentMethodCode, string>
>;

export type PaymentInstructionTemplatesSnapshotV1 = {
  version: 1;
  templates: PaymentInstructionTemplates;
};

export type SavedPaymentInstructionTemplate = {
  methodCode: PaymentMethodCode;
  body: string;
};

export type PaymentInstructionTemplateIssue =
  | "NOT_AN_OBJECT"
  | "UNKNOWN_METHOD"
  | "METHOD_NOT_SELECTED"
  | "TOO_LONG"
  | "TOTAL_TOO_LONG"
  | "UNSAFE_CREDENTIALS";

export type PaymentInstructionTemplatesValidation =
  | { success: true; value: PaymentInstructionTemplates }
  | { success: false; issue: PaymentInstructionTemplateIssue };

const METHOD_SET = new Set<string>(PAYMENT_METHOD_CODES);

export function normalizePaymentInstructionTemplates(
  value: unknown,
): PaymentInstructionTemplates {
  const raw = parseTemplateObject(value);
  if (!raw) return {};

  const templates: PaymentInstructionTemplates = {};
  for (const code of PAYMENT_METHOD_CODES) {
    const candidate = raw[code];
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) templates[code] = trimmed;
  }
  return templates;
}

export function validatePaymentInstructionTemplates(
  value: unknown,
  selectedMethods: readonly PaymentMethodCode[],
): PaymentInstructionTemplatesValidation {
  if (value === undefined || value === null) return { success: true, value: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { success: false, issue: "NOT_AN_OBJECT" };
  }

  const raw = value as Record<string, unknown>;
  const selected = new Set(selectedMethods);
  for (const [code, candidate] of Object.entries(raw)) {
    if (!METHOD_SET.has(code)) return { success: false, issue: "UNKNOWN_METHOD" };
    if (typeof candidate !== "string") return { success: false, issue: "NOT_AN_OBJECT" };
    if (candidate.trim() && !selected.has(code as PaymentMethodCode)) {
      return { success: false, issue: "METHOD_NOT_SELECTED" };
    }
    if ([...candidate].length > PAYMENT_INSTRUCTION_TEMPLATE_MAX_LENGTH) {
      return { success: false, issue: "TOO_LONG" };
    }
    if (candidate.trim() && containsUnsafePaymentCredentials(candidate)) {
      return { success: false, issue: "UNSAFE_CREDENTIALS" };
    }
  }

  const totalLength = Object.values(raw).reduce<number>(
    (total, candidate) => total + [...(candidate as string).trim()].length,
    0,
  );
  if (totalLength > PAYMENT_INSTRUCTION_TEMPLATES_TOTAL_MAX_LENGTH) {
    return { success: false, issue: "TOTAL_TOO_LONG" };
  }

  return { success: true, value: normalizePaymentInstructionTemplates(raw) };
}

export function paymentInstructionTemplatesSnapshot(
  templates: PaymentInstructionTemplates,
): PaymentInstructionTemplatesSnapshotV1 {
  return { version: 1, templates: normalizePaymentInstructionTemplates(templates) };
}

export function parsePaymentInstructionTemplates(
  value: unknown,
): PaymentInstructionTemplates {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return {};
  return normalizePaymentInstructionTemplates(raw.templates);
}

export function samePaymentInstructionTemplates(
  left: PaymentInstructionTemplates,
  right: PaymentInstructionTemplates,
) {
  return PAYMENT_METHOD_CODES.every(
    (code) => (left[code] ?? "") === (right[code] ?? ""),
  );
}

export function buildSavedPaymentInstructions(
  templates: PaymentInstructionTemplates,
): string | null {
  const sections = PAYMENT_METHOD_CODES.flatMap((code) => {
    const body = templates[code]?.trim();
    return body ? [`${paymentMethodTemplateHeading(code)}\n${body}`] : [];
  });
  return sections.length ? sections.join("\n\n") : null;
}

export function savedPaymentInstructionTemplateEntries(
  templates: PaymentInstructionTemplates,
): SavedPaymentInstructionTemplate[] {
  return PAYMENT_METHOD_CODES.flatMap((methodCode) => {
    const body = templates[methodCode]?.trim();
    return body ? [{ methodCode, body }] : [];
  });
}

function parseTemplateObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function paymentMethodTemplateHeading(code: PaymentMethodCode) {
  switch (code) {
    case "CASH_AT_PROPERTY": return "Cash at the property";
    case "BANK_TRANSFER_LOCAL_SEPA": return "Local or SEPA bank transfer";
    case "BANK_TRANSFER_INTERNATIONAL": return "International bank transfer";
    case "PAYPAL": return "PayPal";
    case "REVOLUT": return "Revolut";
    case "WISE": return "Wise";
    case "BITCOIN": return "Bitcoin";
    case "HOST_SECURE_CARD_LINK": return "Secure card payment link";
    case "OTHER": return "Other payment method";
    case "ARRANGE_DIRECTLY": return "Payment arrangement";
  }
}
