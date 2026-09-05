"use server";

import { requireHost } from "@/lib/auth-helpers";
import {
  getPaymentCopyPayload,
  listPaymentCopySources,
} from "@/lib/services/listing-payment-copy.service";
import type {
  PaymentCopyPayload,
  PaymentCopySource,
} from "@/lib/payments/payment-copy";

/**
 * Read-only boundaries for "copy payment details from another listing".
 *
 * Both actions only ever read, and both read the caller's own listings. The copy itself
 * happens in the host's browser: the payload lands in the payment editor's draft, the
 * host looks at it, and the section's existing Save is still the only thing that writes.
 * That is deliberate — a one-click action that silently rewrote a live listing's account
 * number is not something a host could catch before a guest saw it.
 */

export type ListPaymentCopySourcesResult =
  | { error: string }
  | { sources: PaymentCopySource[] };

export async function listPaymentCopySourcesAction(
  excludeListingId?: string,
): Promise<ListPaymentCopySourcesResult> {
  const host = await requireHost();
  const sources = await listPaymentCopySources(host.id, excludeListingId);
  return { sources };
}

export type LoadPaymentCopyPayloadResult =
  | { error: string }
  | { payload: PaymentCopyPayload };

export async function loadPaymentCopyPayloadAction(
  sourceListingId: string,
): Promise<LoadPaymentCopyPayloadResult> {
  const host = await requireHost();
  const payload = await getPaymentCopyPayload(sourceListingId, host.id);
  if (!payload) return { error: "Listing not found." };
  return { payload };
}
