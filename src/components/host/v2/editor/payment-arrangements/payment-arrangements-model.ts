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
import {
  PAYMENT_DETAIL_FIELDS,
  methodSupportsPaymentDetails,
  paymentDetailsAreComplete,
  validatePaymentMethodDetails,
  type PaymentDetailFieldValues,
  type PaymentDetailIssues,
  type PaymentMethodDetailsMap,
} from "@/lib/payments/payment-details";

/** Re-export the shared domain vocabulary so the editor cannot drift from the server. */
export const PAYMENT_METHOD_CODES = SHARED_PAYMENT_METHOD_CODES;
export type PaymentMethodCode = SharedPaymentMethodCode;

/**
 * Raw field text per method, exactly as typed.
 *
 * The draft holds strings rather than validated details because these are controlled
 * inputs: a half-typed IBAN has to survive a re-render. Normalization and validation
 * happen on save, and again on the server.
 */
export type PaymentDetailsDraftMap = Partial<
  Record<PaymentMethodCode, PaymentDetailFieldValues>
>;

export type PaymentArrangementsDraft = {
  methodCodes: PaymentMethodCode[];
  otherLabel: string | null;
  /** Legacy V1 free text. Read-only in the editor; only ever carried or cleared. */
  instructionTemplates?: PaymentInstructionTemplates;
  details?: PaymentDetailsDraftMap;
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

/**
 * The DOM id stem a method's controls are built from.
 *
 * Exported because the wizard has to be able to send focus to one of those controls
 * without owning the markup that renders it, and a second copy of this transform is
 * exactly how a focus target ends up pointing at an element that no longer exists.
 */
export function paymentMethodRowId(code: PaymentMethodCode): string {
  return `payment-method-${code.toLowerCase().replaceAll("_", "-")}`;
}

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

/** Drops fields no method defines and details for methods no longer selected. */
export function normalizePaymentDetailsDraft(
  details: PaymentDetailsDraftMap | undefined,
  methodCodes: readonly PaymentMethodCode[],
): PaymentDetailsDraftMap {
  const next: PaymentDetailsDraftMap = {};
  for (const code of methodCodes) {
    const values = details?.[code];
    if (!values || !methodSupportsPaymentDetails(code)) continue;
    const kept: PaymentDetailFieldValues = {};
    for (const field of PAYMENT_DETAIL_FIELDS[code]) {
      const value = values[field.key];
      if (typeof value === "string" && value.trim() !== "") kept[field.key] = value;
    }
    if (Object.keys(kept).length > 0) next[code] = kept;
  }
  return next;
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
    details: normalizePaymentDetailsDraft(draft.details, methodCodes),
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

/** Every method's field-level problems, keyed by method then field. */
export function paymentDetailIssues(
  draft: PaymentArrangementsDraft,
): Partial<Record<PaymentMethodCode, PaymentDetailIssues>> {
  const issues: Partial<Record<PaymentMethodCode, PaymentDetailIssues>> = {};
  const methodCodes = normalizePaymentMethodCodes(draft.methodCodes);
  for (const code of methodCodes) {
    const values = draft.details?.[code];
    if (!values) continue;
    const result = validatePaymentMethodDetails(code, values);
    if (!result.success) issues[code] = result.issues;
  }
  return issues;
}

/**
 * Whether one method is ready to send without the host typing anything at acceptance.
 *
 * "Missing details" is not an error — a host may deliberately share details later — so
 * this drives a neutral status chip rather than a validation failure.
 */
export function paymentMethodDetailsStatus(
  draft: PaymentArrangementsDraft,
  code: PaymentMethodCode,
): "READY" | "MISSING" | "NOT_APPLICABLE" {
  if (!methodSupportsPaymentDetails(code)) return "NOT_APPLICABLE";
  const values = draft.details?.[code];
  if (values && paymentDetailsAreComplete(code, values)) return "READY";
  // Legacy free text still counts as ready: it is what the host has, and it works.
  if (draft.instructionTemplates?.[code]?.trim()) return "READY";
  return "MISSING";
}

export function paymentArrangementsAreComplete(draft: PaymentArrangementsDraft): boolean {
  const methodCodes = normalizePaymentMethodCodes(draft.methodCodes);
  if (methodCodes.length === 0) return false;
  if (methodCodes.includes("OTHER")) {
    if (validateOtherPaymentLabel(draft.otherLabel ?? "") !== null) return false;
  }
  const normalized = normalizePaymentArrangementsDraft(draft);
  if (Object.keys(paymentDetailIssues(normalized)).length > 0) return false;
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

function sameDetailsDraft(
  left: PaymentDetailsDraftMap,
  right: PaymentDetailsDraftMap,
): boolean {
  return PAYMENT_METHOD_CODES.every((code) => {
    const leftValues = left[code] ?? {};
    const rightValues = right[code] ?? {};
    const keys = new Set([...Object.keys(leftValues), ...Object.keys(rightValues)]);
    return [...keys].every((key) => leftValues[key] === rightValues[key]);
  });
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
    sameDetailsDraft(normalizedLeft.details ?? {}, normalizedRight.details ?? {}) &&
    normalizedLeft.methodCodes.length === normalizedRight.methodCodes.length &&
    normalizedLeft.methodCodes.every((code, index) => code === normalizedRight.methodCodes[index])
  );
}

/** Turns saved server details into the editor's raw-string draft shape. */
export function detailsMapToDraft(
  details: PaymentMethodDetailsMap,
): PaymentDetailsDraftMap {
  const draft: PaymentDetailsDraftMap = {};
  for (const code of PAYMENT_METHOD_CODES) {
    const entry = details[code];
    if (entry && Object.keys(entry.fields).length > 0) {
      draft[code] = { ...entry.fields };
    }
  }
  return draft;
}

/** The wire shape the Server Action expects: `{ [method]: { fields } }`. */
export function draftDetailsToPayload(
  draft: PaymentArrangementsDraft,
): Record<string, { fields: PaymentDetailFieldValues }> {
  const normalized = normalizePaymentArrangementsDraft(draft);
  const payload: Record<string, { fields: PaymentDetailFieldValues }> = {};
  for (const code of normalized.methodCodes) {
    const values = normalized.details?.[code];
    if (values && Object.keys(values).length > 0) payload[code] = { fields: values };
  }
  return payload;
}
