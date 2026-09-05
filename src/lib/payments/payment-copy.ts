import {
  paymentMethodsFromRow,
  type ListingPaymentMethodsRow,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";
import {
  parsePaymentInstructionStore,
  type PaymentInstructionTemplates,
} from "@/lib/payments/payment-instruction-templates";
import type { PaymentMethodDetailsMap } from "@/lib/payments/payment-details";

/**
 * Reading one listing's saved payment answer so another listing can start from it.
 *
 * A copy and not an inheritance: what these produce is a snapshot the host then reviews
 * and saves under their own name on the target listing. Nothing here writes, and nothing
 * links the two listings — changing the source's IBAN later leaves every earlier copy
 * exactly as it was. That is the honest half of the trade: a host with eight listings
 * still edits eight, but they never retype an account number.
 *
 * Pure on purpose, so the two rules that matter can be asserted without a database:
 * an answer only travels if it survives `paymentMethodsFromRow`, and nothing travels
 * for a method the copy does not also select.
 */

/** The row shape both readers need. Matches the columns the copy service selects. */
export interface PaymentCopyRow extends ListingPaymentMethodsRow {
  id: string;
  title: string;
  paymentInstructionTemplates: unknown;
}

export interface PaymentCopySource {
  id: string;
  title: string;
  methods: PaymentMethodCode[];
  otherLabel: string | null;
  /**
   * How many of those methods carry private details on the source.
   *
   * A count rather than the details themselves: this list is rendered before the host
   * has chosen anything, and there is no reason for every listing's account numbers to
   * sit in the page just because a picker might be opened.
   */
  detailCount: number;
  reviewedAt: string;
}

export interface PaymentCopyPayload {
  methods: PaymentMethodCode[];
  otherLabel: string | null;
  /** Legacy V1 free text, carried across so a converted host loses nothing. */
  instructionTemplates: PaymentInstructionTemplates;
  details: PaymentMethodDetailsMap;
}

/**
 * One row as a pickable source, or `null` when it has no answer worth offering.
 *
 * `paymentMethodsFromRow` is the gate: it returns nothing for an unreviewed row and
 * drops a malformed OTHER label, so an answer that survives it is one a host can be
 * shown. Offering an unreviewed listing would promise to copy a blank.
 */
export function paymentCopySourceFromRow(row: PaymentCopyRow): PaymentCopySource | null {
  const preferences = paymentMethodsFromRow(row);
  if (preferences.reviewedAt === null || preferences.methods.length === 0) return null;

  const store = parsePaymentInstructionStore(row.paymentInstructionTemplates);
  // Legacy free text counts as details: it is what the host has, and it still works.
  const detailCount = preferences.methods.filter(
    (code) =>
      Object.keys(store.details[code]?.fields ?? {}).length > 0 ||
      Boolean(store.templates[code]?.trim()),
  ).length;

  return {
    id: row.id,
    title: row.title,
    methods: preferences.methods,
    otherLabel: preferences.otherLabel,
    detailCount,
    reviewedAt: preferences.reviewedAt.toISOString(),
  };
}

/**
 * The full answer to drop into the target's editor, private details included.
 *
 * Templates and details are pruned to the methods that travel with them. A stray
 * template for an unselected method is exactly what the save validator refuses as
 * `METHOD_NOT_SELECTED`, so a copy that carried one would produce a form the host
 * could not save and could not see the reason for.
 */
export function paymentCopyPayloadFromRow(row: PaymentCopyRow): PaymentCopyPayload | null {
  const preferences = paymentMethodsFromRow(row);
  if (preferences.reviewedAt === null || preferences.methods.length === 0) return null;

  const store = parsePaymentInstructionStore(row.paymentInstructionTemplates);
  const selected = new Set<PaymentMethodCode>(preferences.methods);
  const instructionTemplates: PaymentInstructionTemplates = {};
  const details: PaymentMethodDetailsMap = {};

  for (const [code, body] of Object.entries(store.templates)) {
    if (selected.has(code as PaymentMethodCode) && body?.trim()) {
      instructionTemplates[code as PaymentMethodCode] = body;
    }
  }
  for (const [code, entry] of Object.entries(store.details)) {
    if (selected.has(code as PaymentMethodCode) && entry) {
      details[code as PaymentMethodCode] = entry;
    }
  }

  return {
    methods: preferences.methods,
    otherLabel: preferences.otherLabel,
    instructionTemplates,
    details,
  };
}
