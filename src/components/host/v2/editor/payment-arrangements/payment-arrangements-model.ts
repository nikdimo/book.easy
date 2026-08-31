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

/**
 * One checkbox change, applied to the whole draft.
 *
 * Lifted out of the editor so the two rules it encodes can be asserted directly rather
 * than through a rendered checkbox: `ARRANGE_DIRECTLY` stays exclusive, and text the
 * host has typed survives a method being switched off and back on. The save normalizer
 * is what finally drops details for a method that stays unselected, so nothing typed is
 * thrown away while the host is still deciding.
 */
export function draftAfterMethodToggle(
  draft: PaymentArrangementsDraft,
  code: PaymentMethodCode,
  checked: boolean,
): PaymentArrangementsDraft {
  const methodCodes = togglePaymentMethod(draft.methodCodes, code, checked);
  return {
    methodCodes,
    otherLabel: methodCodes.includes("OTHER") ? (draft.otherLabel ?? "") : null,
    instructionTemplates: draft.instructionTemplates ?? {},
    details: draft.details ?? {},
  };
}

/** The method whose detail drawer is open, or `null` for none. */
export type PaymentDetailsDrawer = PaymentMethodCode | null;

/**
 * What the drawer does when a method is ticked or unticked.
 *
 * Nothing, unless the method that was just cleared is the one on screen. Selecting a
 * method and editing its details are two separate acts: a checkbox that also throws a
 * modal over the list makes "I accept cash too" cost a dismissal, and it moves focus
 * away from the row the host was working down.
 */
export function drawerAfterMethodToggle(
  open: PaymentDetailsDrawer,
  code: PaymentMethodCode,
  checked: boolean,
): PaymentDetailsDrawer {
  if (!checked && open === code) return null;
  return open;
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

export type PaymentMethodDetailState =
  | "NOT_APPLICABLE"
  | "NONE"
  | "ADDED"
  | "ATTENTION";

/**
 * What one method's private details are, in the *draft* the host is looking at.
 *
 * Three deliberate distinctions:
 *
 * `NONE` is not a failure. Details are optional — a host may always share them by hand
 * when they accept a booking — so an empty method reads as "Optional", never as missing.
 *
 * `ADDED` says the draft holds something, and says nothing about the database. This
 * screen keeps a local draft that is only written by the section's own Save, so calling
 * a typed-but-unsaved IBAN "saved" would be a lie a host has no way to catch.
 *
 * `ATTENTION` is the one state that needs the host: something is entered and it does not
 * validate, which is also what blocks the section's Save.
 */
export function paymentMethodDetailState(
  draft: PaymentArrangementsDraft,
  code: PaymentMethodCode,
): PaymentMethodDetailState {
  if (!methodSupportsPaymentDetails(code)) return "NOT_APPLICABLE";

  const values = draft.details?.[code];
  const entered =
    values !== undefined &&
    Object.values(values).some((value) => (value ?? "").trim() !== "");
  if (entered && !validatePaymentMethodDetails(code, values).success) {
    return "ATTENTION";
  }
  if (entered) return "ADDED";
  // Legacy free text is details too: it is what the host has, and it still works.
  if (draft.instructionTemplates?.[code]?.trim()) return "ADDED";
  return "NONE";
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
