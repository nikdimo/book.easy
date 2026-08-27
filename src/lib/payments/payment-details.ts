/**
 * V2 structured payment details.
 *
 * V1 stored one free-text string per method: the host typed a paragraph and a scanner
 * did its best to keep credentials out of it. V2 stores named fields instead, so an
 * IBAN can be checksummed, a payment link can be required to be HTTPS, and a card
 * number can be rejected outright rather than hoped against.
 *
 * Nothing here is ever public. These values reach a guest only through the private
 * payment request the host reviews and sends after accepting a booking, and only for
 * the one method that booking uses.
 */
import {
  BITCOIN_NETWORKS,
  isBitcoinNetwork,
  looksLikeIban,
  normalizeIban,
  validateBic,
  validateBitcoinAddress,
  validateDomesticAccountNumber,
  validateIban,
  validatePaymentUrl,
  type BitcoinNetwork,
} from "./payment-field-validators";
import {
  containsUnsafePaymentCredentials,
  looksLikePaymentCardNumber,
  mentionsSecurityCredential,
} from "@/lib/services/payment-instructions";
import { PAYMENT_METHOD_CODES, type PaymentMethodCode } from "./payment-methods";

export type PaymentDetailFieldType =
  /** A person, bank, or place name. Prose-ish, no identifier semantics. */
  | "NAME"
  /** An IBAN when it looks like one, otherwise a domestic account number. */
  | "ACCOUNT_IDENTIFIER"
  | "BIC"
  /** A provider handle, email, or payment URL — whichever the provider uses. */
  | "PROVIDER_IDENTIFIER"
  /** An HTTPS payment link and nothing else. */
  | "PAYMENT_URL"
  | "CRYPTO_ADDRESS"
  | "NETWORK"
  | "REFERENCE"
  | "NOTE"
  /** Free single-line value for a host-named method we know nothing about. */
  | "GENERIC";

export type PaymentDetailMask =
  | "NONE"
  | "IBAN"
  | "EMAIL"
  | "HANDLE"
  | "ADDRESS"
  | "URL";

export interface PaymentDetailFieldDef {
  key: string;
  type: PaymentDetailFieldType;
  required: boolean;
  maxLength: number;
  /** Whether the guest's card offers a copy button for this value. */
  copyable: boolean;
  /** How the host's collapsed row abbreviates it, when it is the summary field. */
  mask: PaymentDetailMask;
  /** The one field a collapsed host row summarises. Exactly one per method. */
  summary?: boolean;
  options?: readonly string[];
  /** Stable English label for server-authored message text. UI resolves i18n instead. */
  sourceLabel: string;
}

const NOTE_FIELD: PaymentDetailFieldDef = {
  key: "note",
  type: "NOTE",
  required: false,
  maxLength: 400,
  copyable: false,
  mask: "NONE",
  sourceLabel: "Note",
};

const REFERENCE_FIELD: PaymentDetailFieldDef = {
  key: "reference",
  type: "REFERENCE",
  required: false,
  maxLength: 60,
  copyable: true,
  mask: "NONE",
  sourceLabel: "Payment reference",
};

function providerField(sourceLabel: string): PaymentDetailFieldDef {
  return {
    key: "providerIdentifier",
    type: "PROVIDER_IDENTIFIER",
    required: true,
    maxLength: 200,
    copyable: true,
    mask: "HANDLE",
    summary: true,
    sourceLabel,
  };
}

/**
 * The field set per method. Order is render order, in the editor and on the guest card.
 *
 * `CASH_AT_PROPERTY` carries a note and nothing else — there is no account to pay into.
 * `ARRANGE_DIRECTLY` carries nothing at all: it is the explicit "we will sort this out
 * later" answer, and giving it fields would contradict what the host chose.
 */
export const PAYMENT_DETAIL_FIELDS: Record<
  PaymentMethodCode,
  readonly PaymentDetailFieldDef[]
> = {
  CASH_AT_PROPERTY: [NOTE_FIELD],
  BANK_TRANSFER_LOCAL_SEPA: [
    {
      key: "accountHolder",
      type: "NAME",
      required: true,
      maxLength: 140,
      copyable: true,
      mask: "NONE",
      sourceLabel: "Account holder",
    },
    {
      key: "bankName",
      type: "NAME",
      required: true,
      maxLength: 140,
      copyable: false,
      mask: "NONE",
      sourceLabel: "Bank name",
    },
    {
      key: "accountIdentifier",
      type: "ACCOUNT_IDENTIFIER",
      required: true,
      maxLength: 60,
      copyable: true,
      mask: "IBAN",
      summary: true,
      sourceLabel: "IBAN or account number",
    },
    {
      key: "swiftBic",
      type: "BIC",
      required: false,
      maxLength: 11,
      copyable: true,
      mask: "NONE",
      sourceLabel: "SWIFT/BIC",
    },
    REFERENCE_FIELD,
    NOTE_FIELD,
  ],
  BANK_TRANSFER_INTERNATIONAL: [
    {
      key: "accountHolder",
      type: "NAME",
      required: true,
      maxLength: 140,
      copyable: true,
      mask: "NONE",
      sourceLabel: "Account holder",
    },
    {
      key: "bankName",
      type: "NAME",
      required: true,
      maxLength: 140,
      copyable: false,
      mask: "NONE",
      sourceLabel: "Bank name",
    },
    {
      key: "bankAddress",
      type: "NAME",
      required: false,
      maxLength: 200,
      copyable: true,
      mask: "NONE",
      sourceLabel: "Bank address",
    },
    {
      key: "accountIdentifier",
      type: "ACCOUNT_IDENTIFIER",
      required: true,
      maxLength: 60,
      copyable: true,
      mask: "IBAN",
      summary: true,
      sourceLabel: "IBAN or account number",
    },
    {
      key: "swiftBic",
      type: "BIC",
      required: true,
      maxLength: 11,
      copyable: true,
      mask: "NONE",
      sourceLabel: "SWIFT/BIC",
    },
    REFERENCE_FIELD,
    NOTE_FIELD,
  ],
  PAYPAL: [providerField("PayPal email, handle, or link"), REFERENCE_FIELD, NOTE_FIELD],
  REVOLUT: [providerField("Revtag, phone, email, or link"), REFERENCE_FIELD, NOTE_FIELD],
  WISE: [providerField("Wise identifier or link"), REFERENCE_FIELD, NOTE_FIELD],
  BITCOIN: [
    {
      key: "network",
      type: "NETWORK",
      required: true,
      maxLength: 20,
      copyable: false,
      mask: "NONE",
      options: BITCOIN_NETWORKS,
      sourceLabel: "Network",
    },
    {
      key: "walletAddress",
      type: "CRYPTO_ADDRESS",
      required: true,
      maxLength: 120,
      copyable: true,
      mask: "ADDRESS",
      summary: true,
      sourceLabel: "Public wallet address",
    },
    NOTE_FIELD,
  ],
  HOST_SECURE_CARD_LINK: [
    {
      key: "paymentUrl",
      type: "PAYMENT_URL",
      required: true,
      maxLength: 400,
      copyable: true,
      mask: "URL",
      summary: true,
      sourceLabel: "Payment link",
    },
    NOTE_FIELD,
  ],
  OTHER: [
    {
      key: "value",
      type: "GENERIC",
      required: false,
      maxLength: 200,
      copyable: true,
      mask: "HANDLE",
      summary: true,
      sourceLabel: "Payment details",
    },
    REFERENCE_FIELD,
    NOTE_FIELD,
  ],
  ARRANGE_DIRECTLY: [],
};

/** Methods that can hold structured details at all. */
export function methodSupportsPaymentDetails(code: PaymentMethodCode): boolean {
  return PAYMENT_DETAIL_FIELDS[code].length > 0;
}

/** Methods that need account coordinates before a payment request means anything. */
export function methodRequiresPaymentDetails(code: PaymentMethodCode): boolean {
  return PAYMENT_DETAIL_FIELDS[code].some((field) => field.required);
}

export function paymentDetailField(
  code: PaymentMethodCode,
  key: string,
): PaymentDetailFieldDef | undefined {
  return PAYMENT_DETAIL_FIELDS[code].find((field) => field.key === key);
}

export type PaymentDetailFieldValues = Record<string, string>;

export interface PaymentMethodDetails {
  version: 2;
  fields: PaymentDetailFieldValues;
  /** When the host last saved these fields. Metadata only; never a value. */
  updatedAt: string;
}

export type PaymentMethodDetailsMap = Partial<
  Record<PaymentMethodCode, PaymentMethodDetails>
>;

export type PaymentDetailFieldIssue =
  | "REQUIRED"
  | "TOO_LONG"
  | "UNSAFE_CREDENTIALS"
  | "LOOKS_LIKE_CARD"
  | "INVALID_IBAN"
  | "IBAN_CHECKSUM"
  | "INVALID_ACCOUNT"
  | "INVALID_BIC"
  | "INVALID_URL"
  | "NOT_HTTPS"
  | "INVALID_ADDRESS"
  | "LOOKS_LIKE_SECRET"
  | "UNKNOWN_OPTION"
  | "INVALID_TEXT"
  | "NOT_ALLOWED";

export type PaymentDetailIssues = Record<string, PaymentDetailFieldIssue>;

export type PaymentMethodDetailsValidation =
  | { success: true; value: PaymentDetailFieldValues }
  | { success: false; issues: PaymentDetailIssues };

/** Per-method and whole-store ceilings. Generous for real data, closed to essays. */
export const PAYMENT_DETAILS_METHOD_MAX_LENGTH = 900;
export const PAYMENT_DETAILS_TOTAL_MAX_LENGTH = 6000;

/** Any C0 control character or DEL, which no single-line identifier ever contains. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Single-line fields lose every internal line break and repeated space. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Validates one field's value in the context of its own definition.
 *
 * Every branch normalizes as well as checks, because the normalized form is what gets
 * stored: an IBAN loses its spaces, a BIC is uppercased, a URL is canonicalized.
 */
function validateField(
  field: PaymentDetailFieldDef,
  rawValue: string,
  siblings: PaymentDetailFieldValues,
): { value: string } | { issue: PaymentDetailFieldIssue } {
  const isNote = field.type === "NOTE";
  const value = isNote
    ? rawValue.trim().replace(/[ \t]{2,}/g, " ")
    : collapseWhitespace(rawValue);

  if (!value) {
    return field.required ? { issue: "REQUIRED" } : { value: "" };
  }
  if ([...value].length > field.maxLength) return { issue: "TOO_LONG" };
  // Notes are the only multi-line field; everything else is a single identifier.
  if (!isNote && hasControlCharacter(value)) return { issue: "INVALID_TEXT" };

  switch (field.type) {
    case "NOTE":
    case "REFERENCE":
    case "NAME": {
      if (containsUnsafePaymentCredentials(value)) {
        return { issue: "UNSAFE_CREDENTIALS" };
      }
      return { value };
    }

    case "GENERIC": {
      // A host-named method could be anything, so this field accepts almost anything —
      // except the two categories that must never be stored under any label. The card
      // check runs first so a bare PAN gets the message that names the actual problem.
      if (looksLikePaymentCardNumber(value)) return { issue: "LOOKS_LIKE_CARD" };
      if (containsUnsafePaymentCredentials(value)) {
        return { issue: "UNSAFE_CREDENTIALS" };
      }
      return { value };
    }

    case "ACCOUNT_IDENTIFIER": {
      if (mentionsSecurityCredential(value)) return { issue: "UNSAFE_CREDENTIALS" };
      // A card number is the one thing an account field must never hold. Checked before
      // the IBAN branch so a Luhn-valid PAN cannot slip through as a "domestic number".
      if (looksLikePaymentCardNumber(value)) return { issue: "LOOKS_LIKE_CARD" };

      if (looksLikeIban(value)) {
        const result = validateIban(value);
        if (result.valid) return { value: result.normalized };
        return {
          issue:
            result.issue === "CHECKSUM_FAILED" ? "IBAN_CHECKSUM" : "INVALID_IBAN",
        };
      }
      const domestic = validateDomesticAccountNumber(value);
      if (!domestic.valid) return { issue: "INVALID_ACCOUNT" };
      return { value: domestic.normalized };
    }

    case "BIC": {
      const result = validateBic(value);
      if (!result.valid) return { issue: "INVALID_BIC" };
      return { value: result.normalized };
    }

    case "PAYMENT_URL": {
      const result = validatePaymentUrl(value);
      if (!result.valid) {
        return { issue: result.issue === "NOT_HTTPS" ? "NOT_HTTPS" : "INVALID_URL" };
      }
      return { value: result.normalized };
    }

    case "PROVIDER_IDENTIFIER": {
      if (containsUnsafePaymentCredentials(value)) {
        return { issue: "UNSAFE_CREDENTIALS" };
      }
      if (looksLikePaymentCardNumber(value)) return { issue: "LOOKS_LIKE_CARD" };
      // A link is held to the same HTTPS rule as a dedicated payment link.
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^www\./i.test(value)) {
        const result = validatePaymentUrl(value);
        if (!result.valid) {
          return { issue: result.issue === "NOT_HTTPS" ? "NOT_HTTPS" : "INVALID_URL" };
        }
        return { value: result.normalized };
      }
      return { value };
    }

    case "NETWORK": {
      if (!field.options?.includes(value)) return { issue: "UNKNOWN_OPTION" };
      return { value };
    }

    case "CRYPTO_ADDRESS": {
      const network = siblings.network;
      if (!isBitcoinNetwork(network)) return { issue: "UNKNOWN_OPTION" };
      const result = validateBitcoinAddress(value, network);
      if (!result.valid) {
        return {
          issue:
            result.issue === "LOOKS_LIKE_SECRET"
              ? "LOOKS_LIKE_SECRET"
              : "INVALID_ADDRESS",
        };
      }
      return { value: result.normalized };
    }
  }
}

/**
 * Validates and normalizes one method's complete field set.
 *
 * Fields that are not part of the method's definition are dropped rather than rejected,
 * so a stale browser tab cannot smuggle a value into a key the server does not know.
 */
export function validatePaymentMethodDetails(
  code: PaymentMethodCode,
  input: unknown,
): PaymentMethodDetailsValidation {
  const definitions = PAYMENT_DETAIL_FIELDS[code];
  if (definitions.length === 0) {
    // Nothing may be stored against a method that has no fields.
    const empty = input && typeof input === "object" && !Array.isArray(input)
      ? Object.values(input as Record<string, unknown>).every(
          (value) => typeof value !== "string" || value.trim() === "",
        )
      : true;
    return empty
      ? { success: true, value: {} }
      : { success: false, issues: { _: "NOT_ALLOWED" } };
  }

  if (input === undefined || input === null) return { success: true, value: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { success: false, issues: { _: "NOT_ALLOWED" } };
  }

  const raw = input as Record<string, unknown>;
  const provided: PaymentDetailFieldValues = {};
  for (const field of definitions) {
    const candidate = raw[field.key];
    if (typeof candidate === "string") provided[field.key] = candidate;
  }

  // A method the host started but left blank is a valid state: they selected it and
  // will share details later. Required fields only bite once something is filled in.
  const anyValue = Object.values(provided).some((value) => value.trim() !== "");
  if (!anyValue) return { success: true, value: {} };

  const issues: PaymentDetailIssues = {};
  const value: PaymentDetailFieldValues = {};
  // Two passes: NETWORK first, because the address field validates against it.
  const ordered = [...definitions].sort((left, right) =>
    left.type === "NETWORK" ? -1 : right.type === "NETWORK" ? 1 : 0,
  );
  for (const field of ordered) {
    const result = validateField(field, provided[field.key] ?? "", value);
    if ("issue" in result) {
      issues[field.key] = result.issue;
      continue;
    }
    if (result.value) value[field.key] = result.value;
  }

  if (Object.keys(issues).length > 0) return { success: false, issues };

  const total = Object.values(value).reduce(
    (sum, entry) => sum + [...entry].length,
    0,
  );
  if (total > PAYMENT_DETAILS_METHOD_MAX_LENGTH) {
    return { success: false, issues: { _: "TOO_LONG" } };
  }

  // Render in definition order so stored objects compare and read predictably.
  const ordinal = new Map(definitions.map((field, index) => [field.key, index]));
  const sorted: PaymentDetailFieldValues = {};
  for (const key of Object.keys(value).sort(
    (left, right) => (ordinal.get(left) ?? 0) - (ordinal.get(right) ?? 0),
  )) {
    sorted[key] = value[key];
  }
  return { success: true, value: sorted };
}

/** True when a method's stored fields satisfy everything the method requires. */
export function paymentDetailsAreComplete(
  code: PaymentMethodCode,
  fields: PaymentDetailFieldValues | undefined,
): boolean {
  const definitions = PAYMENT_DETAIL_FIELDS[code];
  if (definitions.length === 0) return false;
  if (!fields) return false;
  const required = definitions.filter((field) => field.required);
  if (required.length === 0) {
    return Object.values(fields).some((value) => value.trim() !== "");
  }
  return required.every((field) => (fields[field.key] ?? "").trim() !== "");
}

/** Reads a stored details object without trusting any of its shape. */
export function parsePaymentMethodDetails(
  code: PaymentMethodCode,
  value: unknown,
): PaymentMethodDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 2) return null;
  const validated = validatePaymentMethodDetails(code, raw.fields);
  if (!validated.success) return null;
  if (Object.keys(validated.value).length === 0) return null;
  const updatedAt =
    typeof raw.updatedAt === "string" && !Number.isNaN(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : new Date(0).toISOString();
  return { version: 2, fields: validated.value, updatedAt };
}

export function parsePaymentMethodDetailsMap(value: unknown): PaymentMethodDetailsMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const map: PaymentMethodDetailsMap = {};
  for (const code of PAYMENT_METHOD_CODES) {
    const parsed = parsePaymentMethodDetails(code, raw[code]);
    if (parsed) map[code] = parsed;
  }
  return map;
}

export function samePaymentMethodDetailsMap(
  left: PaymentMethodDetailsMap,
  right: PaymentMethodDetailsMap,
): boolean {
  return PAYMENT_METHOD_CODES.every((code) => {
    const leftFields = left[code]?.fields ?? {};
    const rightFields = right[code]?.fields ?? {};
    const keys = new Set([...Object.keys(leftFields), ...Object.keys(rightFields)]);
    return [...keys].every((key) => leftFields[key] === rightFields[key]);
  });
}

/** Total stored size across every method, for the whole-store ceiling. */
export function paymentMethodDetailsMapLength(map: PaymentMethodDetailsMap): number {
  return PAYMENT_METHOD_CODES.reduce((total, code) => {
    const fields = map[code]?.fields ?? {};
    return (
      total +
      Object.values(fields).reduce((sum, value) => sum + [...value].length, 0)
    );
  }, 0);
}

/**
 * Abbreviates a saved value for the host's collapsed row.
 *
 * Enough to recognise which destination is saved, never enough to be the destination.
 * The host's own expanded editor and the guest's private card both show full values —
 * masking here is about a list of rows that a shoulder-surfer should not be able to
 * harvest, not about hiding data from its owner.
 */
export function maskPaymentDetailValue(
  value: string,
  mask: PaymentDetailMask,
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  switch (mask) {
    case "IBAN": {
      const compact = normalizeIban(trimmed);
      if (compact.length <= 8) return compact;
      return `${compact.slice(0, 4)} •••• ${compact.slice(-4)}`;
    }
    case "EMAIL": {
      const at = trimmed.indexOf("@");
      if (at <= 0) return trimmed;
      return `${trimmed[0]}•••••${trimmed.slice(at)}`;
    }
    case "HANDLE": {
      if (trimmed.includes("@") && !trimmed.startsWith("@")) {
        return maskPaymentDetailValue(trimmed, "EMAIL");
      }
      if (/^https?:\/\//i.test(trimmed)) {
        return maskPaymentDetailValue(trimmed, "URL");
      }
      if (trimmed.length <= 24) return trimmed;
      return `${trimmed.slice(0, 20)}…`;
    }
    case "ADDRESS": {
      if (trimmed.length <= 14) return trimmed;
      return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
    }
    case "URL": {
      try {
        const url = new URL(trimmed);
        return url.pathname === "/" ? url.hostname : `${url.hostname}/…`;
      } catch {
        return trimmed.length <= 24 ? trimmed : `${trimmed.slice(0, 20)}…`;
      }
    }
    case "NONE":
      return trimmed;
  }
}

/** The one-line summary shown on a collapsed host row, or null when nothing is saved. */
export function maskedPaymentDetailsSummary(
  code: PaymentMethodCode,
  fields: PaymentDetailFieldValues | undefined,
): string | null {
  if (!fields) return null;
  const definitions = PAYMENT_DETAIL_FIELDS[code];
  const summaryField =
    definitions.find((field) => field.summary) ??
    definitions.find((field) => field.required);
  if (summaryField) {
    const value = fields[summaryField.key];
    if (value) return maskPaymentDetailValue(value, summaryField.mask);
  }
  // Note-only methods (Cash) still deserve a hint that something is saved.
  const note = fields.note?.trim();
  if (note) return note.length <= 32 ? note : `${note.slice(0, 30)}…`;
  return null;
}

export interface PaymentDetailRow {
  key: string;
  sourceLabel: string;
  value: string;
  copyable: boolean;
  type: PaymentDetailFieldType;
}

/** Ordered, non-empty rows for the guest's card and the private message formatter. */
export function paymentDetailRows(
  code: PaymentMethodCode,
  fields: PaymentDetailFieldValues | undefined,
): PaymentDetailRow[] {
  if (!fields) return [];
  return PAYMENT_DETAIL_FIELDS[code].flatMap((field) => {
    const value = (fields[field.key] ?? "").trim();
    if (!value) return [];
    return [
      {
        key: field.key,
        sourceLabel: field.sourceLabel,
        value:
          field.type === "NETWORK" ? bitcoinNetworkSourceLabel(value) : value,
        copyable: field.copyable,
        type: field.type,
      },
    ];
  });
}

export function bitcoinNetworkSourceLabel(value: string): string {
  switch (value as BitcoinNetwork) {
    case "BITCOIN":
      return "Bitcoin (on-chain)";
    case "LIGHTNING":
      return "Lightning";
    default:
      return value;
  }
}

/**
 * The structured details rendered as text, for the private conversation message.
 *
 * The message stays the human-readable record of what was sent; the structured snapshot
 * on the booking is what the guest's card renders. Both say the same thing.
 */
export function formatPaymentDetailsAsText(
  code: PaymentMethodCode,
  fields: PaymentDetailFieldValues | undefined,
): string {
  return paymentDetailRows(code, fields)
    .map((row) => `${row.sourceLabel}: ${row.value}`)
    .join("\n");
}
