"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHEET_PRIMARY_BUTTON, SheetPanel } from "@/components/host/v2/sheet-panel";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  PAYMENT_DETAIL_FIELDS,
  type PaymentDetailIssues,
} from "@/lib/payments/payment-details";
import { FieldIssueMessage, PaymentDetailFields } from "./payment-detail-fields";
import type {
  PaymentArrangementsDraft,
  PaymentMethodCode,
} from "./payment-arrangements-model";

/**
 * One payment method's private details, in a drawer.
 *
 * A drawer rather than the inline panel this replaced. The panel opened *between* the
 * method rows, so pressing "Add details" on the second of ten methods pushed the other
 * eight, the guest summary, the deposits section and the cancellation section down the
 * page — and on the desktop editor, where the section pane is the scroll container, it
 * moved the row out from under the pointer that had just clicked it.
 *
 * It owns no values. Every keystroke goes straight out through `onFieldChange` into the
 * editor's draft, which is why half-entered text survives closing and reopening: there
 * is nothing here to lose. `SheetPanel` unmounting while closed is then a feature rather
 * than a hazard.
 *
 * "Done" and not "Save": closing this drawer changes nothing on the server. The section's
 * own Save button, below the method list, is still the only thing that writes.
 */
export function PaymentDetailsSheet({
  code,
  draft,
  issues,
  legacyText,
  showLegacy,
  disabled,
  title,
  returnFocusTo,
  onClose,
  onFieldChange,
  onConvert,
}: {
  /** The open method, or `null` when nothing is open. Exactly one at a time, by shape. */
  code: PaymentMethodCode | null;
  draft: PaymentArrangementsDraft;
  issues: PaymentDetailIssues | undefined;
  /** The host's V1 paragraph for this method, if they have one. */
  legacyText: string;
  /** False once the host has asked to replace that paragraph with the fields. */
  showLegacy: boolean;
  disabled: boolean;
  /** The method's own name. A drawer titled "Details" says nothing about which. */
  title: string;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onFieldChange: (key: string, value: string) => void;
  onConvert: () => void;
}) {
  const i18n = useI18n();
  if (code === null) return null;

  const values = draft.details?.[code] ?? {};
  const hasIssues = Boolean(issues && Object.keys(issues).length > 0);
  const base = code.toLowerCase().replaceAll("_", "-");

  return (
    <SheetPanel
      open
      variant="side"
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      title={title}
      description={
        i18n.resolve(
          "host.editor.payment_arrangements.sheet_description",
          "Only shared with a guest after you accept their booking.",
        ).text
      }
      footer={
        <button type="button" onClick={onClose} className={SHEET_PRIMARY_BUTTON}>
          <Tx k="host.editor.payment_arrangements.details_done" source="Done" />
        </button>
      }
    >
      {showLegacy ? (
        <LegacyInstructions
          text={legacyText}
          disabled={disabled}
          onConvert={onConvert}
        />
      ) : (
        <>
          {legacyText ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <Tx
                k="host.editor.payment_arrangements.convert_pending"
                source="Your previous saved text is still in place. It is replaced only when you save these fields."
              />
            </p>
          ) : null}
          <PaymentDetailFields
            code={code}
            values={values}
            issues={issues}
            disabled={disabled}
            idPrefix={`payment-field-${base}`}
            layout="stack"
            onChange={onFieldChange}
          />
          {issues?._ ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-rose-700">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <FieldIssueMessage issue={issues._} />
            </p>
          ) : null}
          {!hasIssues && PAYMENT_DETAIL_FIELDS[code].some((field) => field.required) ? (
            <p className="text-xs leading-5 text-slate-500">
              <Tx
                k="host.editor.payment_arrangements.details_optional_now"
                source="You can leave these blank and share the details when you accept a booking."
              />
            </p>
          ) : null}
        </>
      )}
    </SheetPanel>
  );
}

/**
 * A host's V1 paragraph, shown as it was written.
 *
 * It is never parsed into the structured fields. Splitting a paragraph into an IBAN and
 * a SWIFT code by pattern-matching is exactly how money ends up sent to the wrong place,
 * so the host re-enters the values themselves and the old text stays visible while
 * they do.
 */
function LegacyInstructions({
  text,
  disabled,
  onConvert,
}: {
  text: string;
  disabled: boolean;
  onConvert: () => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">
        <Tx
          k="host.editor.payment_arrangements.legacy_heading"
          source="Legacy saved instructions"
        />
      </h3>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        <Tx
          k="host.editor.payment_arrangements.legacy_description"
          source="These still work and will prefill your message when you accept a booking. Convert them to fields to get checks on the IBAN and payment links."
        />
      </p>
      <pre
        className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs leading-5 text-slate-800"
        translate="no"
      >
        {text}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onConvert}
        className="mt-3 rounded-full"
      >
        <Tx
          k="host.editor.payment_arrangements.legacy_convert"
          source="Convert to structured fields"
        />
      </Button>
    </div>
  );
}
