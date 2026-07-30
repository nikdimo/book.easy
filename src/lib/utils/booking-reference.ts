import { randomBytes } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newBookingReference(now = new Date()): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (let index = 0; index < 8; index += 1) {
    suffix += ALPHABET[bytes[index % bytes.length] % ALPHABET.length];
  }
  return `LH-${now.getUTCFullYear()}-${suffix}`;
}

export function formatBookingReference(reference: string): string {
  return reference.toUpperCase();
}
