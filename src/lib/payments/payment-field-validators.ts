/**
 * Format-level validators for the structured payment details a host saves.
 *
 * Every function here answers one question only: *does this value look like the kind of
 * identifier it claims to be?* None of them contact a bank, a wallet, or a payment
 * provider, and none of them can tell whether an account exists or belongs to the host.
 * That limit is deliberate and is surfaced to hosts in the editor copy — a checksum that
 * passes proves a typo-free string, nothing more.
 */

/**
 * IBAN length per country, from the SWIFT IBAN registry.
 *
 * The length is part of the format: a country's IBAN is always exactly this long, so a
 * mistyped or truncated value is caught here before the MOD-97 checksum ever runs.
 */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
  GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30,
  KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27,
  MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31,
  SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24,
  TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export type IbanIssue =
  | "EMPTY"
  | "INVALID_CHARACTERS"
  | "UNKNOWN_COUNTRY"
  | "WRONG_LENGTH"
  | "CHECKSUM_FAILED";

export type IbanResult =
  | { valid: true; normalized: string; countryCode: string }
  | { valid: false; issue: IbanIssue };

/** Strips spaces and separators and uppercases, which is how an IBAN is stored. */
export function normalizeIban(value: string): string {
  return value.replace(/[\s -]/g, "").toUpperCase();
}

/** Groups a stored IBAN into the four-character blocks people read and check. */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * MOD-97-10 over the rearranged IBAN (ISO 7064), computed in chunks so the value never
 * exceeds JavaScript's safe integer range.
 */
function mod97(rearranged: string): number {
  let remainder = 0;
  for (const character of rearranged) {
    const code = character.charCodeAt(0);
    // 'A'–'Z' expand to 10–35; digits stay themselves.
    const digits =
      code >= 65 && code <= 90 ? String(code - 55) : character;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

export function validateIban(value: string): IbanResult {
  const normalized = normalizeIban(value);
  if (!normalized) return { valid: false, issue: "EMPTY" };
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return { valid: false, issue: "INVALID_CHARACTERS" };
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)) {
    return { valid: false, issue: "INVALID_CHARACTERS" };
  }

  const countryCode = normalized.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (!expectedLength) return { valid: false, issue: "UNKNOWN_COUNTRY" };
  if (normalized.length !== expectedLength) {
    return { valid: false, issue: "WRONG_LENGTH" };
  }

  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  if (mod97(rearranged) !== 1) return { valid: false, issue: "CHECKSUM_FAILED" };

  return { valid: true, normalized, countryCode };
}

export function ibanCountryCode(value: string): string | null {
  const result = validateIban(value);
  return result.valid ? result.countryCode : null;
}

/** Looks like an IBAN attempt — two letters, two digits, then alphanumerics. */
export function looksLikeIban(value: string): boolean {
  return /^[A-Za-z]{2}\d{2}[A-Za-z0-9\s-]{6,}$/.test(value.trim());
}

export type BicIssue = "EMPTY" | "INVALID_FORMAT" | "UNKNOWN_COUNTRY";

export type BicResult =
  | { valid: true; normalized: string; countryCode: string }
  | { valid: false; issue: BicIssue };

const ISO_COUNTRIES = new Set(Object.keys(IBAN_LENGTHS));
/**
 * BIC country codes are ISO 3166-1 and are not limited to IBAN countries, so the IBAN
 * registry above is too narrow on its own. These are the additional codes a BIC in this
 * product realistically carries.
 */
const EXTRA_BIC_COUNTRIES =
  "AF AG AI AM AO AR AS AU AW BB BD BF BJ BM BN BO BS BT BW BZ CA CD CF CG CI CK CL CM CN CO CU CV CW DM DZ EC ER ET FJ FM GA GD GH GM GN GQ GU GW GY HK HN HT ID IN JM JP KE KG KH KI KM KN KP KR KY LA LK LR LS MA MG MH ML MM MO MP MS MV MW MX MY MZ NA NC NE NG NP NR NZ OM PA PE PF PG PH PN PR PW PY RE RW SB SG SH SL SN SR SS SX SY SZ TC TD TG TH TJ TK TM TO TT TV TW TZ UG US UY UZ VC VE VI VN VU WS YE ZA ZM ZW".split(
    " ",
  );
for (const code of EXTRA_BIC_COUNTRIES) ISO_COUNTRIES.add(code);

export function normalizeBic(value: string): string {
  return value.replace(/[\s -]/g, "").toUpperCase();
}

/**
 * ISO 9362: four institution letters, two country letters, a two-character location,
 * and an optional three-character branch. Eight or eleven characters, never nine or ten.
 */
export function validateBic(value: string): BicResult {
  const normalized = normalizeBic(value);
  if (!normalized) return { valid: false, issue: "EMPTY" };
  const match = normalized.match(
    /^([A-Z]{4})([A-Z]{2})([A-Z0-9]{2})([A-Z0-9]{3})?$/,
  );
  if (!match) return { valid: false, issue: "INVALID_FORMAT" };
  if (!ISO_COUNTRIES.has(match[2])) {
    return { valid: false, issue: "UNKNOWN_COUNTRY" };
  }
  return { valid: true, normalized, countryCode: match[2] };
}

export type PaymentUrlIssue = "EMPTY" | "INVALID_URL" | "NOT_HTTPS" | "HAS_CREDENTIALS";

export type PaymentUrlResult =
  | { valid: true; normalized: string; hostname: string }
  | { valid: false; issue: PaymentUrlIssue };

/**
 * Payment links must be HTTPS. A plain-HTTP checkout page can be read and rewritten in
 * transit, and a link carrying `user:password@` is a credential in a URL — neither
 * belongs in something a host asks a guest to open and pay through.
 */
export function validatePaymentUrl(value: string): PaymentUrlResult {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, issue: "EMPTY" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // A bare host is a common paste; retry once as HTTPS rather than rejecting outright.
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return { valid: false, issue: "INVALID_URL" };
    }
  }

  if (url.protocol === "http:") return { valid: false, issue: "NOT_HTTPS" };
  if (url.protocol !== "https:") return { valid: false, issue: "INVALID_URL" };
  if (url.username || url.password) {
    return { valid: false, issue: "HAS_CREDENTIALS" };
  }
  if (!url.hostname.includes(".")) return { valid: false, issue: "INVALID_URL" };

  return { valid: true, normalized: url.toString(), hostname: url.hostname };
}

export const BITCOIN_NETWORKS = ["BITCOIN", "LIGHTNING"] as const;
export type BitcoinNetwork = (typeof BITCOIN_NETWORKS)[number];

export function isBitcoinNetwork(value: unknown): value is BitcoinNetwork {
  return (
    typeof value === "string" &&
    (BITCOIN_NETWORKS as readonly string[]).includes(value)
  );
}

export type BitcoinAddressIssue =
  | "EMPTY"
  | "UNKNOWN_NETWORK"
  | "INVALID_FORMAT"
  | "LOOKS_LIKE_SECRET";

export type BitcoinAddressResult =
  | { valid: true; normalized: string }
  | { valid: false; issue: BitcoinAddressIssue };

/**
 * A seed phrase is a run of ordinary dictionary words; a real address never is. Twelve
 * or more space-separated words in an address field is a host about to publish the keys
 * to their own wallet, so it is refused before anything else looks at the value.
 */
function looksLikeSeedPhrase(value: string): boolean {
  const words = value.trim().split(/\s+/);
  return words.length >= 12 && words.every((word) => /^[a-z]{3,8}$/i.test(word));
}

/**
 * A hex private key (64 hex characters, with or without an `0x` prefix) or a WIF key.
 * Both are secrets that would drain the wallet they belong to.
 */
function looksLikePrivateKey(value: string): boolean {
  const compact = value.trim();
  if (/^(?:0x)?[0-9a-f]{64}$/i.test(compact)) return true;
  return /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(compact);
}

/**
 * Format-level only: prefix, character set, and length for the selected network.
 *
 * This deliberately does not verify the bech32 or base58check checksum. Doing so would
 * add a dependency and, worse, would imply a correctness guarantee this product cannot
 * stand behind — so the editor says the format looks right and never more than that.
 */
export function validateBitcoinAddress(
  value: string,
  network: BitcoinNetwork,
): BitcoinAddressResult {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, issue: "EMPTY" };
  if (looksLikeSeedPhrase(trimmed) || looksLikePrivateKey(trimmed)) {
    return { valid: false, issue: "LOOKS_LIKE_SECRET" };
  }

  if (network === "BITCOIN") {
    // Native segwit / taproot (bech32, bech32m) — lowercase or uppercase, never mixed.
    if (/^(?:bc1)[023456789acdefghjklmnpqrstuvwxyz]{8,87}$/.test(trimmed)) {
      return { valid: true, normalized: trimmed };
    }
    if (/^(?:BC1)[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{8,87}$/.test(trimmed)) {
      return { valid: true, normalized: trimmed.toLowerCase() };
    }
    // P2PKH and P2SH (base58check).
    if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(trimmed)) {
      return { valid: true, normalized: trimmed };
    }
    return { valid: false, issue: "INVALID_FORMAT" };
  }

  // Lightning: an LNURL, a BOLT12 offer, or a lightning address (user@domain).
  if (/^lnurl1[02-9ac-hj-np-z]{10,}$/i.test(trimmed)) {
    return { valid: true, normalized: trimmed.toLowerCase() };
  }
  if (/^lno1[02-9ac-hj-np-z]{10,}$/i.test(trimmed)) {
    return { valid: true, normalized: trimmed.toLowerCase() };
  }
  if (/^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed)) {
    return { valid: true, normalized: trimmed };
  }
  return { valid: false, issue: "INVALID_FORMAT" };
}

/**
 * A domestic account number, for countries and banks that do not use IBAN.
 *
 * The rule is intentionally loose — national formats vary far too much to enumerate —
 * but it still rejects the two things that must never land here: free prose, and a
 * value that is really a payment card number.
 */
export type AccountNumberIssue = "EMPTY" | "INVALID_FORMAT" | "TOO_SHORT" | "TOO_LONG";

export type AccountNumberResult =
  | { valid: true; normalized: string }
  | { valid: false; issue: AccountNumberIssue };

export function validateDomesticAccountNumber(value: string): AccountNumberResult {
  const trimmed = value.trim().replace(/\s{2,}/g, " ");
  if (!trimmed) return { valid: false, issue: "EMPTY" };
  if (!/^[A-Za-z0-9][A-Za-z0-9\s./-]*$/.test(trimmed)) {
    return { valid: false, issue: "INVALID_FORMAT" };
  }
  const compact = trimmed.replace(/[\s./-]/g, "");
  // Every national account format is built on digits. A value with none of them is
  // prose — "ask me for it" — and belongs in the note field, not here.
  if (!/\d/.test(compact)) return { valid: false, issue: "INVALID_FORMAT" };
  if (compact.length < 5) return { valid: false, issue: "TOO_SHORT" };
  if (compact.length > 34) return { valid: false, issue: "TOO_LONG" };
  return { valid: true, normalized: trimmed };
}
