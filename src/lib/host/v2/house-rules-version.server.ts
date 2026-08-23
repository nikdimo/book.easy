import "server-only";

import { createHash } from "node:crypto";
import type { HouseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";

/**
 * An opaque fingerprint of the exact house-rules snapshot rendered to a guest.
 *
 * The booking request carries only this fingerprint, never a client-authored copy of
 * the rules. The booking service recomputes it from the listing row inside its
 * transaction, which prevents a host edit made after the page loaded from being
 * recorded as rules the guest accepted without seeing.
 */
export function houseRulesVersion(snapshot: HouseRulesSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
