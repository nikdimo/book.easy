/**
 * Payment instructions are intentionally never repeated outside the secure
 * conversation thread. Keep this string free of booking/listing/user details so it
 * is also safe for lock-screen notifications and email previews.
 */
export const PAYMENT_INSTRUCTIONS_PREVIEW =
  "Payment instructions are available in Linger Homes";

const SECURITY_CREDENTIAL_PATTERN =
  /\b(?:cvv|cvc|cid|security\s*code|card\s*verification|pin|password|passcode|recovery\s*codes?|backup\s*codes?|one[\s-]*time\s*(?:code|password)|otp|seed\s*phrase|mnemonic(?:\s*phrase)?|private\s*key)\b/i;

function luhnIsValid(digits: string) {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

/** Detect 13–19 digit PAN candidates even when conventional separators are used. */
function containsPaymentCardPan(value: string) {
  const candidates = value.matchAll(/(?:^|[^\d])((?:\d[ -]?){12,18}\d)(?!\d)/g);
  for (const candidate of candidates) {
    const digits = candidate[1].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnIsValid(digits)) {
      return true;
    }
  }
  return false;
}

export function containsUnsafePaymentCredentials(value: string) {
  return SECURITY_CREDENTIAL_PATTERN.test(value) || containsPaymentCardPan(value);
}

/** Details that belong only in the redacted payment-instructions channel. */
export function containsPaymentCoordinates(value: string) {
  return (
    // IBANs (country prefix + check digits + compact/spaced account body).
    /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/i.test(value) ||
    // Explicit bank-routing/account identifiers.
    /\b(?:iban|swift|bic|routing|account\s*(?:number|no\.?))\b/i.test(value) ||
    // Provider payment handles or checkout links; ordinary unrelated links remain chat-safe.
    /\b(?:paypal\.me|revolut\.me|wise\.com\/(?:pay|payment)|buy\.stripe\.com|checkout\.stripe\.com)\S*/i.test(value) ||
    /\b(?:paypal|revolut|wise)\b.{0,24}(?:@[A-Z0-9._%+-]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(value) ||
    // Common Bitcoin address encodings.
    /\b(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/.test(value)
  );
}

/**
 * Bank transfer identifiers and payment links are supported. Card data and account
 * recovery credentials are not safe to share through this feature.
 */
export function assertSafePaymentInstructions(body: string) {
  if (containsUnsafePaymentCredentials(body)) {
    // Do not interpolate the supplied text: server-action errors can be rendered or
    // logged by callers and payment instructions must stay in the message record only.
    throw new Error(
      "Payment instructions cannot include card or account-security credentials"
    );
  }
}
