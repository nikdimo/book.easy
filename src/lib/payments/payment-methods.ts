/**
 * The complete Phase 2 payment-method contract.
 *
 * This module intentionally contains no account fields. A method says only which
 * channel a host accepts; private instructions are shared later, after acceptance.
 */
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

export const PAYMENT_METHOD_OTHER_MIN_LENGTH = 2;
export const PAYMENT_METHOD_OTHER_MAX_LENGTH = 40;

export const UNANSWERED_PAYMENT_METHODS_FALLBACK =
  "Payment is arranged directly with the host after the booking request is accepted.";
export const REVIEWED_PAYMENT_METHODS_EXPLANATION =
  "The host will share payment instructions after accepting your request.";

export interface ListingPaymentMethodsInput {
  methods: PaymentMethodCode[];
  otherLabel: string | null;
}

export type PaymentMethodsIssue =
  | "NOT_AN_ARRAY"
  | "REQUIRED"
  | "UNKNOWN_METHOD"
  | "DUPLICATE_METHOD"
  | "ARRANGE_DIRECTLY_EXCLUSIVE";

export type PaymentMethodOtherIssue =
  | "REQUIRED"
  | "NOT_ALLOWED"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "PRIVATE_OR_INSTRUCTIONAL_CONTENT";

export interface ListingPaymentMethodsIssues {
  methods?: PaymentMethodsIssue;
  otherLabel?: PaymentMethodOtherIssue;
}

export type ListingPaymentMethodsValidation =
  | { success: true; value: ListingPaymentMethodsInput }
  | { success: false; issues: ListingPaymentMethodsIssues };

const PAYMENT_METHOD_SET = new Set<string>(PAYMENT_METHOD_CODES);
const ISO_COUNTRY_CODES = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  ),
);

export function isPaymentMethodCode(value: unknown): value is PaymentMethodCode {
  return typeof value === "string" && PAYMENT_METHOD_SET.has(value);
}

export function normalizeOtherPaymentMethodLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/ {2,}/g, " ");
  return trimmed === "" ? null : trimmed;
}

function characterCount(value: string): number {
  return [...value].length;
}

/**
 * Reject anything that resembles a destination, credential, identifier, or an
 * instruction. OTHER is a short public method name (for example, "MobilePay"), not a
 * place to tell a guest how or where to pay.
 */
export function otherPaymentMethodLabelIssue(
  value: string,
): PaymentMethodOtherIssue | undefined {
  const length = characterCount(value);
  if (length < PAYMENT_METHOD_OTHER_MIN_LENGTH) return "TOO_SHORT";
  if (length > PAYMENT_METHOD_OTHER_MAX_LENGTH) return "TOO_LONG";
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} &+'’.()-]*$/u.test(value)) {
    return "PRIVATE_OR_INSTRUCTIONAL_CONTENT";
  }

  const compact = value.replace(/[\s-]/g, "");
  const upperCompact = compact.toUpperCase();
  const sensitivePatterns = [
    // URLs, domains, email addresses, and payment handles.
    /(?:https?:\/\/|www\.)/i,
    /\b[a-z0-9][a-z0-9.-]*@[a-z0-9.-]+\.[a-z]{2,}\b/i,
    /(?:^|\s)[$@][a-z0-9._-]{2,}\b/i,
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,62})\.)+[a-z]{2,24}(?:\/\S*)?\b/i,
    // Explicit banking/card identifiers and payment instructions.
    /\b(?:iban|swift|bic|routing|sort\s*code|bank\s*account|account\s*(?:holder|number|no\.?|#)|card\s*(?:number|details)|cvv|cvc)\b/i,
    /\b(?:pay|send|transfer|deposit|wire)\s+(?:to|at|into|via)\b/i,
    /\bpay\s+(?:after|before|when|once|by)\b/i,
    /\bplease\s+(?:pay|send|transfer|deposit|wire|bring|contact|message)\b/i,
    /\b(?:send|transfer|deposit|wire|bring)\s+(?:money|funds|cash|payment)\b/i,
    /\b(?:dm|message|contact)\s+(?:me|the host|host|us)\b/i,
    /\b(?:cash|card)\s+(?:at|on|to)\b/i,
    /\b(?:before arrival|after booking|after acceptance|on arrival|use reference)\b/i,
    /\b(?:refund|payout|protected|protection|guarantee(?:d)?|paid|unpaid|pending|complete|completed|successful|failed)\b/i,
    /[\r\n\t\u0000-\u001f\u007f]/,
    // Phone/card/account-like digit runs, including common separators.
    /(?:\+?\d[\s().-]*){7,}/,
    /^\d[\d\s().-]{3,}$/,
    /\b\d{6,}\b/,
    /\b(?:0[1-9]|1[0-2])\s*\/\s*\d{2,4}\b/,
    // Common cryptocurrency address families.
    /\b(?:bc1|tb1)[a-z0-9]{20,}\b/i,
    /\b0x[a-f0-9]{16,}\b/i,
    /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/,
    /\b(?=[1-9A-HJ-NP-Za-km-z]{30,40}\b)(?=[1-9A-HJ-NP-Za-km-z]*\d)[1-9A-HJ-NP-Za-km-z]+\b/,
  ];
  if (sensitivePatterns.some((pattern) => pattern.test(value))) {
    return "PRIVATE_OR_INSTRUCTIONAL_CONTENT";
  }

  // IBANs can contain spaces, and SWIFT/BIC values are normally 8 or 11 characters.
  if (/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/.test(upperCompact)) {
    return "PRIVATE_OR_INSTRUCTIONAL_CONTENT";
  }
  const candidates = [compact, ...(value.match(/[a-z0-9]+/gi) ?? [])];
  const containsSwiftLike = candidates.some((candidate) => {
    const match = candidate
      .toUpperCase()
      .match(/^[A-Z]{4}([A-Z]{2})[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/);
    return Boolean(match && ISO_COUNTRY_CODES.has(match[1]));
  });
  if (containsSwiftLike) {
    return "PRIVATE_OR_INSTRUCTIONAL_CONTENT";
  }

  return undefined;
}

/** Strict validation for every server-side save entry point. */
export function validateListingPaymentMethods(
  input: unknown,
): ListingPaymentMethodsValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, issues: { methods: "NOT_AN_ARRAY" } };
  }

  const raw = input as Record<string, unknown>;
  const issues: ListingPaymentMethodsIssues = {};
  if (!Array.isArray(raw.methods)) {
    return { success: false, issues: { methods: "NOT_AN_ARRAY" } };
  }

  if (raw.methods.length === 0) issues.methods = "REQUIRED";
  else if (!raw.methods.every(isPaymentMethodCode)) issues.methods = "UNKNOWN_METHOD";
  else if (new Set(raw.methods).size !== raw.methods.length) {
    issues.methods = "DUPLICATE_METHOD";
  } else if (
    raw.methods.includes("ARRANGE_DIRECTLY") &&
    raw.methods.length !== 1
  ) {
    issues.methods = "ARRANGE_DIRECTLY_EXCLUSIVE";
  }

  const otherLabel = normalizeOtherPaymentMethodLabel(raw.otherLabel);
  const includesOther = raw.methods.includes("OTHER");
  if (includesOther) {
    if (otherLabel === null) issues.otherLabel = "REQUIRED";
    else issues.otherLabel = otherPaymentMethodLabelIssue(otherLabel);
  } else if (otherLabel !== null) {
    issues.otherLabel = "NOT_ALLOWED";
  }

  if (Object.values(issues).some(Boolean)) return { success: false, issues };

  const selected = new Set(raw.methods as PaymentMethodCode[]);
  return {
    success: true,
    value: {
      // Canonical order keeps database rows and booking snapshots stable regardless of
      // the order in which UI controls happened to emit their selection.
      methods: PAYMENT_METHOD_CODES.filter((method) => selected.has(method)),
      otherLabel,
    },
  };
}

export interface ListingPaymentMethodsRow {
  acceptedPaymentMethods: readonly string[];
  paymentMethodOther: string | null;
  paymentMethodsReviewedAt: Date | null;
}

export interface ListingPaymentMethodsPreferences {
  status: "REVIEWED" | "UNANSWERED";
  methods: PaymentMethodCode[];
  otherLabel: string | null;
  reviewedAt: Date | null;
  explanation: string;
}

/**
 * Produces the small DTO consumed by host and public UI. Unreviewed rows never expose
 * stray values, and malformed stored OTHER content is dropped rather than rendered.
 */
export function paymentMethodsFromRow(
  row: ListingPaymentMethodsRow,
): ListingPaymentMethodsPreferences {
  if (row.paymentMethodsReviewedAt === null) {
    return {
      status: "UNANSWERED",
      methods: [],
      otherLabel: null,
      reviewedAt: null,
      explanation: UNANSWERED_PAYMENT_METHODS_FALLBACK,
    };
  }

  let methods = PAYMENT_METHOD_CODES.filter((method) =>
    row.acceptedPaymentMethods.includes(method),
  );
  if (methods.includes("ARRANGE_DIRECTLY")) methods = ["ARRANGE_DIRECTLY"];

  let otherLabel = methods.includes("OTHER")
    ? normalizeOtherPaymentMethodLabel(row.paymentMethodOther)
    : null;
  if (
    methods.includes("OTHER") &&
    (otherLabel === null || otherPaymentMethodLabelIssue(otherLabel))
  ) {
    methods = methods.filter((method) => method !== "OTHER");
    otherLabel = null;
  }

  return {
    status: "REVIEWED",
    methods,
    otherLabel,
    reviewedAt: row.paymentMethodsReviewedAt,
    explanation: REVIEWED_PAYMENT_METHODS_EXPLANATION,
  };
}

export interface PaymentMethodsSnapshotV1 {
  version: 1;
  status: "REVIEWED" | "UNANSWERED";
  methods: PaymentMethodCode[];
  otherLabel: string | null;
}

/** Server-side V1 booking snapshot, derived only from a persisted listing row. */
export function paymentMethodsSnapshot(
  row: ListingPaymentMethodsRow,
): PaymentMethodsSnapshotV1 {
  const preferences = paymentMethodsFromRow(row);
  return {
    version: 1,
    status: preferences.status,
    methods: preferences.methods,
    otherLabel: preferences.otherLabel,
  };
}

/** Safely reads nullable/backward-compatible booking JSON. */
export function parsePaymentMethodsSnapshot(
  value: unknown,
): PaymentMethodsSnapshotV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  if (raw.status === "UNANSWERED") {
    if (!Array.isArray(raw.methods) || raw.methods.length !== 0) return null;
    if (raw.otherLabel !== null) return null;
    return { version: 1, status: "UNANSWERED", methods: [], otherLabel: null };
  }
  if (raw.status !== "REVIEWED") return null;

  const validated = validateListingPaymentMethods({
    methods: raw.methods,
    otherLabel: raw.otherLabel,
  });
  if (!validated.success) return null;
  return { version: 1, status: "REVIEWED", ...validated.value };
}
