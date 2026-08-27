"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PaymentDetailFields,
  FieldIssueMessage,
} from "@/components/host/v2/editor/payment-arrangements/payment-detail-fields";
import { PaymentMethodName } from "@/components/booking/accepted-payment-methods";
import {
  methodSupportsPaymentDetails,
  paymentDetailRows,
  paymentDetailsAreComplete,
  validatePaymentMethodDetails,
  type PaymentDetailFieldValues,
  type PaymentDetailIssues,
} from "@/lib/payments/payment-details";
import type { BookingPaymentRequestPrefill } from "@/lib/payments/booking-payment-request";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import { PaymentFieldLabel } from "@/components/host/v2/editor/payment-arrangements/payment-detail-fields";
import { Tx, useI18n } from "@/lib/i18n/client";

export type PaymentRequestValue = {
  method: PaymentMethodCode | null;
  /** Structured sends carry fields; a legacy or hand-written send carries text. */
  mode: "STRUCTURED" | "FREE_TEXT";
  fields: PaymentDetailFieldValues;
  instructions: string;
  saveForFuture: boolean;
  /** Whether this is complete enough to send. The server checks again regardless. */
  isReady: boolean;
};

/**
 * The host's review-and-send step, prefilled from what they already saved.
 *
 * The normal path is three glances and a click: the method the guest chose, the details
 * that will go with it, send. Editing is available but deliberately not the default —
 * the host has already entered this data once.
 */
export function PaymentRequestComposer({
  prefill,
  idPrefix,
  disabled = false,
  onChange,
}: {
  prefill: BookingPaymentRequestPrefill;
  idPrefix: string;
  disabled?: boolean;
  onChange: (value: PaymentRequestValue) => void;
}) {
  const i18n = useI18n();
  const [method, setMethod] = useState<PaymentMethodCode | null>(prefill.method);
  const [fields, setFields] = useState<PaymentDetailFieldValues>(
    prefill.savedDetailFields,
  );
  const [instructions, setInstructions] = useState(prefill.savedInstructions);
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [editing, setEditing] = useState(prefill.savedDetailsKind !== "STRUCTURED");

  const structuredMethod = method !== null && methodSupportsPaymentDetails(method);
  const mode: PaymentRequestValue["mode"] =
    structuredMethod && prefill.savedDetailsKind !== "LEGACY_TEXT"
      ? "STRUCTURED"
      : "FREE_TEXT";

  const validation = useMemo(() => {
    if (!method || mode !== "STRUCTURED") return null;
    return validatePaymentMethodDetails(method, fields);
  }, [method, mode, fields]);

  const issues: PaymentDetailIssues | undefined =
    validation && !validation.success ? validation.issues : undefined;

  const normalizedFields = validation?.success ? validation.value : fields;
  const isReady =
    method !== null &&
    (mode === "STRUCTURED"
      ? Boolean(validation?.success) &&
        paymentDetailsAreComplete(method, normalizedFields)
      : instructions.trim().length > 0);

  useEffect(() => {
    onChange({
      method,
      mode,
      fields: mode === "STRUCTURED" ? fields : {},
      instructions: mode === "FREE_TEXT" ? instructions : "",
      saveForFuture,
      isReady,
    });
    // `onChange` is a render-scoped callback in both call sites; depending on it would
    // loop. The value below is what the parent needs, and it is complete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, mode, fields, instructions, saveForFuture, isReady]);

  /** Switching method on a legacy booking clears fields typed for the previous one. */
  function changeMethod(next: string) {
    const code = next as PaymentMethodCode;
    setMethod(code);
    setFields({});
    setInstructions("");
    setEditing(true);
  }

  const previewRows = method ? paymentDetailRows(method, normalizedFields) : [];
  const showPreview =
    mode === "STRUCTURED" && !editing && previewRows.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
        {prefill.methodSource === "GUEST" && method ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              <Tx
                k="booking.payment_request.guest_chose"
                source="The guest chose"
              />
              {": "}
            </span>
            <span className="font-medium">
              <PaymentMethodName t={i18n} code={method} otherLabel={prefill.otherLabel} />
            </span>
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-method`}>
              <Tx
                k="booking.payment_request.choose_method"
                source="Payment method for this booking"
              />
            </Label>
            <Select
              value={method ?? undefined}
              onValueChange={changeMethod}
              disabled={disabled}
            >
              <SelectTrigger id={`${idPrefix}-method`} className="w-full justify-between">
                <SelectValue
                  placeholder={
                    i18n.resolve(
                      "booking.payment_request.choose_method_placeholder",
                      "Choose a method",
                    ).text
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {prefill.availableMethods.map((code) => (
                  <SelectItem key={code} value={code}>
                    <PaymentMethodName t={i18n} code={code} otherLabel={prefill.otherLabel} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              <Tx
                k="booking.payment_request.no_guest_choice"
                source="This booking was made before guests chose a method, so pick the one you agreed on."
              />
            </p>
          </div>
        )}
      </div>

      {method === null ? null : showPreview ? (
        <div className="rounded-lg border border-border/80 p-3">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-sm font-medium">
              <Tx
                k="booking.payment_request.preview_heading"
                source="What the guest will receive"
              />
            </h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" aria-hidden />
              <Tx
                k="booking.payment_request.edit_for_booking"
                source="Edit for this booking"
              />
            </Button>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {previewRows.map((row) => (
              <div key={row.key} className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">
                  <PaymentFieldLabel code={method} fieldKey={row.key} />
                </dt>
                <dd className="font-medium break-all" translate="no">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            <Tx
              k="booking.payment_request.edit_note"
              source="Editing here changes this booking's message only. Your saved details stay as they are unless you tick the box below."
            />
          </p>
        </div>
      ) : mode === "STRUCTURED" ? (
        <div className="space-y-3">
          <PaymentDetailFields
            code={method}
            values={fields}
            issues={issues}
            disabled={disabled}
            idPrefix={`${idPrefix}-field`}
            onChange={(key, value) =>
              setFields((current) => ({ ...current, [key]: value }))
            }
          />
          {issues?._ ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <FieldIssueMessage issue={issues._} />
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-instructions`}>
            <Tx
              k="booking.payment_request.instructions_label"
              source="Payment details to send"
            />
          </Label>
          <Textarea
            id={`${idPrefix}-instructions`}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={disabled}
            maxLength={1200}
            rows={5}
            autoComplete="off"
            spellCheck
            translate="no"
            placeholder={
              i18n.resolve(
                "booking.payment_request.instructions_placeholder",
                "The account, link, handle, or other details the guest needs.",
              ).text
            }
          />
          {prefill.savedDetailsKind === "LEGACY_TEXT" ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <Tx
                k="booking.payment_request.legacy_prefill"
                source="Prefilled from your saved instructions for this method."
              />
            </p>
          ) : null}
        </div>
      )}

      {method !== null ? (
        <>
          {/* Two sentences, one line. They keep their original keys so the reviewed
              translations already written for them stay in use. */}
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <Tx
                k="booking.payment_progress.instructions_private"
                source="This is sent only inside the Linger Homes conversation."
              />{" "}
              <Tx
                k="booking.payment_progress.instructions_security"
                source="Never ask for or send a card number, CVV, PIN, password, seed phrase, or private key."
              />
            </span>
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveForFuture}
              disabled={disabled}
              onChange={(event) => setSaveForFuture(event.currentTarget.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <Tx
                k="booking.payment_request.save_for_future"
                source="Save these details for future bookings using this method"
              />
            </span>
          </label>
        </>
      ) : null}
    </div>
  );
}
