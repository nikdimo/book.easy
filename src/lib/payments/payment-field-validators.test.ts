import { describe, expect, it } from "vitest";
import {
  formatIban,
  ibanCountryCode,
  looksLikeIban,
  normalizeBic,
  normalizeIban,
  validateBic,
  validateBitcoinAddress,
  validateDomesticAccountNumber,
  validateIban,
  validatePaymentUrl,
} from "./payment-field-validators";

describe("IBAN", () => {
  it("normalizes away the spacing people actually type", () => {
    expect(normalizeIban("mk07 2501 2000 0058 984")).toBe("MK07250120000058984");
    expect(normalizeIban("DK50-0040-0440-1162-43")).toBe("DK5000400440116243");
    expect(normalizeIban("  gb82 west 1234 5698 7654 32  ")).toBe(
      "GB82WEST12345698765432",
    );
  });

  it("groups a stored IBAN back into readable blocks", () => {
    expect(formatIban("DK5000400440116243")).toBe("DK50 0040 0440 1162 43");
  });

  it("accepts real IBANs across several countries", () => {
    for (const iban of [
      "DK5000400440116243",
      "GB82 WEST 1234 5698 7654 32",
      "DE89 3704 0044 0532 0130 00",
      "MK07 2501 2000 0058 984",
      "NL91ABNA0417164300",
      "FR1420041010050500013M02606",
    ]) {
      const result = validateIban(iban);
      expect(result, iban).toMatchObject({ valid: true });
    }
  });

  it("reports the country of a valid IBAN", () => {
    expect(ibanCountryCode("DK5000400440116243")).toBe("DK");
    expect(ibanCountryCode("MK07 2501 2000 0058 984")).toBe("MK");
    expect(ibanCountryCode("not an iban")).toBeNull();
  });

  it("rejects a MOD-97 checksum failure, which is what a typo produces", () => {
    // One digit changed from the valid Danish IBAN above.
    expect(validateIban("DK5000400440116244")).toEqual({
      valid: false,
      issue: "CHECKSUM_FAILED",
    });
    expect(validateIban("GB82WEST12345698765433")).toEqual({
      valid: false,
      issue: "CHECKSUM_FAILED",
    });
  });

  it("rejects the wrong length for the country, even when characters are valid", () => {
    expect(validateIban("DK500040044011624")).toEqual({
      valid: false,
      issue: "WRONG_LENGTH",
    });
    expect(validateIban("DK50004004401162431")).toEqual({
      valid: false,
      issue: "WRONG_LENGTH",
    });
  });

  it("rejects an unknown country and malformed input", () => {
    expect(validateIban("ZZ0000400440116243")).toEqual({
      valid: false,
      issue: "UNKNOWN_COUNTRY",
    });
    expect(validateIban("1234567890123456")).toEqual({
      valid: false,
      issue: "INVALID_CHARACTERS",
    });
    expect(validateIban("")).toEqual({ valid: false, issue: "EMPTY" });
  });

  it("recognises an IBAN attempt without judging whether it is valid", () => {
    expect(looksLikeIban("DK50 0040 0440 1162 43")).toBe(true);
    expect(looksLikeIban("DK5000400440116244")).toBe(true);
    expect(looksLikeIban("300000000003320")).toBe(false);
    expect(looksLikeIban("4111 1111 1111 1111")).toBe(false);
  });
});

describe("SWIFT/BIC", () => {
  it("accepts 8- and 11-character codes and uppercases them", () => {
    expect(validateBic("dabadkkk")).toEqual({
      valid: true,
      normalized: "DABADKKK",
      countryCode: "DK",
    });
    expect(validateBic("KOBSMK2X")).toMatchObject({ valid: true });
    expect(validateBic("DEUTDEFF500")).toMatchObject({ valid: true });
    expect(normalizeBic("deut de ff")).toBe("DEUTDEFF");
  });

  it("rejects every length that is not 8 or 11", () => {
    for (const bic of ["DABADKK", "DABADKKK1", "DABADKKK12", "DABADKKK1234"]) {
      expect(validateBic(bic), bic).toMatchObject({ valid: false });
    }
  });

  it("rejects a code whose country segment is not a real country", () => {
    expect(validateBic("DABAZZKK")).toEqual({
      valid: false,
      issue: "UNKNOWN_COUNTRY",
    });
  });

  it("rejects digits in the institution segment", () => {
    expect(validateBic("DAB4DKKK")).toEqual({
      valid: false,
      issue: "INVALID_FORMAT",
    });
  });
});

describe("payment links", () => {
  it("accepts HTTPS links and canonicalizes them", () => {
    const result = validatePaymentUrl("https://paypal.me/nikola");
    expect(result).toMatchObject({ valid: true, hostname: "paypal.me" });
  });

  it("upgrades a bare host to HTTPS rather than rejecting a plain paste", () => {
    expect(validatePaymentUrl("paypal.me/nikola")).toMatchObject({
      valid: true,
      hostname: "paypal.me",
    });
  });

  it("refuses plain HTTP, because a checkout page must not be rewritable in transit", () => {
    expect(validatePaymentUrl("http://paypal.me/nikola")).toEqual({
      valid: false,
      issue: "NOT_HTTPS",
    });
  });

  it("refuses a URL carrying credentials or a non-web scheme", () => {
    expect(validatePaymentUrl("https://user:pass@example.com/pay")).toEqual({
      valid: false,
      issue: "HAS_CREDENTIALS",
    });
    expect(validatePaymentUrl("javascript:alert(1)")).toEqual({
      valid: false,
      issue: "INVALID_URL",
    });
    expect(validatePaymentUrl("not a link")).toEqual({
      valid: false,
      issue: "INVALID_URL",
    });
  });
});

describe("Bitcoin addresses", () => {
  it("accepts on-chain address families", () => {
    for (const address of [
      "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    ]) {
      expect(validateBitcoinAddress(address, "BITCOIN"), address).toMatchObject({
        valid: true,
      });
    }
  });

  it("accepts Lightning identifiers on the Lightning network only", () => {
    expect(validateBitcoinAddress("nikola@getalby.com", "LIGHTNING")).toMatchObject({
      valid: true,
    });
    expect(
      validateBitcoinAddress("nikola@getalby.com", "BITCOIN"),
    ).toMatchObject({ valid: false, issue: "INVALID_FORMAT" });
    expect(
      validateBitcoinAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "LIGHTNING"),
    ).toMatchObject({ valid: false, issue: "INVALID_FORMAT" });
  });

  it("refuses a seed phrase or private key outright", () => {
    expect(
      validateBitcoinAddress(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        "BITCOIN",
      ),
    ).toEqual({ valid: false, issue: "LOOKS_LIKE_SECRET" });
    expect(
      validateBitcoinAddress(
        "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss",
        "BITCOIN",
      ),
    ).toEqual({ valid: false, issue: "LOOKS_LIKE_SECRET" });
    expect(
      validateBitcoinAddress(
        "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
        "BITCOIN",
      ),
    ).toEqual({ valid: false, issue: "LOOKS_LIKE_SECRET" });
  });

  it("rejects prose and malformed addresses", () => {
    expect(validateBitcoinAddress("send it to my wallet", "BITCOIN")).toMatchObject({
      valid: false,
    });
    expect(validateBitcoinAddress("", "BITCOIN")).toEqual({
      valid: false,
      issue: "EMPTY",
    });
  });
});

describe("domestic account numbers", () => {
  it("accepts the separators national formats actually use", () => {
    expect(validateDomesticAccountNumber("300-0000000-33")).toMatchObject({
      valid: true,
    });
    expect(validateDomesticAccountNumber("12345678")).toMatchObject({ valid: true });
    expect(validateDomesticAccountNumber("0004/1234567")).toMatchObject({
      valid: true,
    });
  });

  it("rejects prose, empty values, and lengths outside any real format", () => {
    expect(validateDomesticAccountNumber("ask me for it")).toMatchObject({
      valid: false,
      issue: "INVALID_FORMAT",
    });
    expect(validateDomesticAccountNumber("1234")).toEqual({
      valid: false,
      issue: "TOO_SHORT",
    });
    expect(validateDomesticAccountNumber("1".repeat(40))).toEqual({
      valid: false,
      issue: "TOO_LONG",
    });
    expect(validateDomesticAccountNumber("   ")).toEqual({
      valid: false,
      issue: "EMPTY",
    });
  });
});
