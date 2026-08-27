/**
 * Base-10 decimal arithmetic for host-declared payment amounts.
 *
 * Linger Homes never moves money, but it does print amounts a guest and a host will
 * settle between themselves, so every figure here is computed with integer coefficients
 * and an explicit scale. No binary floating-point value ever participates: `0.1 + 0.2`
 * arithmetic in a currency a guest is asked to hand over is a bug, not a rounding taste.
 *
 * This module is deliberately free of any policy shape so both the frozen V1 deposit
 * model and the live V2 advance-payment/damage-deposit model can share it without one
 * importing the other.
 */

export type DecimalLike = string | number | { toString(): string };

/** Converts harmless user/Prisma decimal representations to one stable string. */
export function normalizeDepositValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : value && typeof (value as DecimalLike).toString === "function"
        ? (value as DecimalLike).toString().trim()
        : "";
  const match = raw.match(/^\+?(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

export function decimalIsPositive(value: string): boolean {
  return /[1-9]/.test(value);
}

export function decimalAtMost(value: string, maximum: string): boolean {
  const [leftWhole, leftFraction = ""] = value.split(".");
  const [rightWhole, rightFraction = ""] = maximum.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const left = BigInt(`${leftWhole}${leftFraction.padEnd(scale, "0")}`);
  const right = BigInt(`${rightWhole}${rightFraction.padEnd(scale, "0")}`);
  return left <= right;
}

interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

function parseNonNegativeDecimal(value: unknown): ParsedDecimal | null {
  const normalized = normalizeDepositValue(value);
  if (normalized === null) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency })
        .resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

function powerOfTen(exponent: number): bigint {
  let result = BigInt(1);
  for (let index = 0; index < exponent; index += 1) result *= BigInt(10);
  return result;
}

function roundToCurrency(decimal: ParsedDecimal, fractionDigits: number): string {
  let coefficient = decimal.coefficient;
  if (decimal.scale > fractionDigits) {
    const divisor = powerOfTen(decimal.scale - fractionDigits);
    const quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    // Half-up is deterministic and matches the ordinary monetary expectation for
    // a positive amount; no binary floating-point value participates.
    coefficient =
      quotient +
      (remainder * BigInt(2) >= divisor ? BigInt(1) : BigInt(0));
  } else if (decimal.scale < fractionDigits) {
    coefficient *= powerOfTen(fractionDigits - decimal.scale);
  }

  if (fractionDigits === 0) return coefficient.toString();
  const digits = coefficient.toString().padStart(fractionDigits + 1, "0");
  return `${digits.slice(0, -fractionDigits)}.${digits.slice(-fractionDigits)}`;
}

/**
 * Resolves one declared amount against a booking total, in that amount's own currency.
 *
 * `FIXED` ignores the total entirely; `PERCENTAGE` reads as a percentage *of the booking
 * total*, which is why the scale gains two places before rounding. The result is a
 * Decimal-safe string in the currency's own minor units, or null if either input is not
 * a usable non-negative decimal.
 */
export function resolveDeclaredAmount(
  amountType: "FIXED" | "PERCENTAGE",
  value: unknown,
  currency: string,
  bookingTotal: DecimalLike,
): string | null {
  const parsedValue = parseNonNegativeDecimal(value);
  if (parsedValue === null) return null;

  let raw: ParsedDecimal;
  if (amountType === "FIXED") {
    raw = parsedValue;
  } else {
    const total = parseNonNegativeDecimal(bookingTotal);
    if (total === null) return null;
    raw = {
      coefficient: total.coefficient * parsedValue.coefficient,
      scale: total.scale + parsedValue.scale + 2,
    };
  }
  return roundToCurrency(raw, currencyFractionDigits(currency));
}
