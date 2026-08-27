import {
  PAYMENT_METHOD_CODES,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";
import {
  formatPaymentDetailsAsText,
  parsePaymentMethodDetailsMap,
  paymentDetailsAreComplete,
  paymentMethodDetailsMapLength,
  validatePaymentMethodDetails,
  PAYMENT_DETAILS_TOTAL_MAX_LENGTH,
  type PaymentDetailIssues,
  type PaymentMethodDetails,
  type PaymentMethodDetailsMap,
} from "@/lib/payments/payment-details";
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
  // V1 and V2 both keep free text under `templates`; V2 simply adds `details`
  // alongside it. Reading either version through this function is unchanged.
  if (raw.version !== 1 && raw.version !== 2) return {};
  return normalizePaymentInstructionTemplates(raw.templates);
}

/**
 * The whole stored blob: legacy V1 free text and V2 structured details together.
 *
 * The two coexist on purpose. A host who wrote a paragraph years ago keeps it until
 * they deliberately convert that method, and converting one method never disturbs
 * what any other method has saved.
 */
export interface PaymentInstructionStore {
  templates: PaymentInstructionTemplates;
  details: PaymentMethodDetailsMap;
}

export type PaymentInstructionStoreSnapshotV2 = {
  version: 2;
  templates: PaymentInstructionTemplates;
  details: PaymentMethodDetailsMap;
};

export function parsePaymentInstructionStore(
  value: unknown,
): PaymentInstructionStore {
  const templates = parsePaymentInstructionTemplates(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { templates, details: {} };
  }
  const raw = value as Record<string, unknown>;
  // A V1 blob has no `details` key at all, which reads as an empty structured map.
  return { templates, details: parsePaymentMethodDetailsMap(raw.details) };
}

export function paymentInstructionStoreSnapshot(
  store: PaymentInstructionStore,
): PaymentInstructionStoreSnapshotV2 {
  return {
    version: 2,
    templates: normalizePaymentInstructionTemplates(store.templates),
    details: store.details,
  };
}

export type PaymentDetailsMapIssue =
  | "NOT_AN_OBJECT"
  | "UNKNOWN_METHOD"
  | "METHOD_NOT_SELECTED"
  | "TOTAL_TOO_LONG";

export type PaymentDetailsMapValidation =
  | { success: true; value: PaymentMethodDetailsMap }
  | {
      success: false;
      issue?: PaymentDetailsMapIssue;
      /** Per-method, per-field problems, for the editor to render in place. */
      fieldIssues?: Partial<Record<PaymentMethodCode, PaymentDetailIssues>>;
    };

/**
 * Validates a complete structured-details map against the methods the host selected.
 *
 * Details for an unselected method are rejected rather than dropped: silently discarding
 * them would lose a host's work without telling them, and accepting them would store
 * account coordinates for a method this listing does not offer.
 */
export function validatePaymentMethodDetailsMap(
  value: unknown,
  selectedMethods: readonly PaymentMethodCode[],
  previous: PaymentMethodDetailsMap = {},
): PaymentDetailsMapValidation {
  if (value === undefined || value === null) return { success: true, value: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { success: false, issue: "NOT_AN_OBJECT" };
  }

  const raw = value as Record<string, unknown>;
  const selected = new Set(selectedMethods);
  const methodSet = new Set<string>(PAYMENT_METHOD_CODES);
  for (const key of Object.keys(raw)) {
    if (!methodSet.has(key)) return { success: false, issue: "UNKNOWN_METHOD" };
  }

  const next: PaymentMethodDetailsMap = {};
  const fieldIssues: Partial<Record<PaymentMethodCode, PaymentDetailIssues>> = {};
  const now = new Date().toISOString();

  for (const code of PAYMENT_METHOD_CODES) {
    const candidate = raw[code];
    if (candidate === undefined) continue;
    const fields =
      candidate && typeof candidate === "object" && !Array.isArray(candidate) &&
      "fields" in (candidate as Record<string, unknown>)
        ? (candidate as Record<string, unknown>).fields
        : candidate;

    const validated = validatePaymentMethodDetails(code, fields);
    if (!validated.success) {
      fieldIssues[code] = validated.issues;
      continue;
    }
    if (Object.keys(validated.value).length === 0) continue;
    if (!selected.has(code)) {
      return { success: false, issue: "METHOD_NOT_SELECTED" };
    }

    // Keep the previous timestamp when nothing about this method actually changed, so
    // an unrelated save does not make every method look freshly edited.
    const before = previous[code];
    const unchanged =
      before !== undefined &&
      Object.keys(validated.value).length === Object.keys(before.fields).length &&
      Object.entries(validated.value).every(
        ([key, entry]) => before.fields[key] === entry,
      );
    next[code] = {
      version: 2,
      fields: validated.value,
      updatedAt: unchanged ? before.updatedAt : now,
    };
  }

  if (Object.keys(fieldIssues).length > 0) return { success: false, fieldIssues };
  if (paymentMethodDetailsMapLength(next) > PAYMENT_DETAILS_TOTAL_MAX_LENGTH) {
    return { success: false, issue: "TOTAL_TOO_LONG" };
  }
  return { success: true, value: next };
}

export function samePaymentInstructionTemplates(
  left: PaymentInstructionTemplates,
  right: PaymentInstructionTemplates,
) {
  return PAYMENT_METHOD_CODES.every(
    (code) => (left[code] ?? "") === (right[code] ?? ""),
  );
}

/**
 * What a host has saved for one method, and in which format.
 *
 * V2 structured details win whenever they exist. Legacy V1 text stays available and
 * usable until the host deliberately converts that method — this function never
 * parses one into the other, because guessing which half of a paragraph is an IBAN is
 * exactly how financial data ends up in the wrong field.
 */
export type ResolvedPaymentInstructions =
  | { kind: "STRUCTURED"; details: PaymentMethodDetails; text: string }
  | { kind: "LEGACY_TEXT"; text: string }
  | { kind: "NONE" };

export function resolvePaymentInstructionsForMethod(
  store: PaymentInstructionStore,
  method: PaymentMethodCode,
): ResolvedPaymentInstructions {
  const details = store.details[method];
  if (details && Object.keys(details.fields).length > 0) {
    return {
      kind: "STRUCTURED",
      details,
      text: formatPaymentDetailsAsText(method, details.fields),
    };
  }
  const legacy = store.templates[method]?.trim();
  if (legacy) return { kind: "LEGACY_TEXT", text: legacy };
  return { kind: "NONE" };
}

/** Whether this method is ready to send without the host typing anything more. */
export function paymentMethodDetailsReady(
  store: PaymentInstructionStore,
  method: PaymentMethodCode,
): boolean {
  const details = store.details[method];
  if (details) return paymentDetailsAreComplete(method, details.fields);
  return Boolean(store.templates[method]?.trim());
}

export function buildSavedPaymentInstructions(
  templates: PaymentInstructionTemplates,
  details: PaymentMethodDetailsMap = {},
): string | null {
  const sections = PAYMENT_METHOD_CODES.flatMap((code) => {
    const structured = details[code];
    if (structured && Object.keys(structured.fields).length > 0) {
      return [
        `${paymentMethodTemplateHeading(code)}\n${formatPaymentDetailsAsText(code, structured.fields)}`,
      ];
    }
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
