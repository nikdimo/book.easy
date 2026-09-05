"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Copy, LoaderCircle, ShieldCheck } from "lucide-react";
import { SheetPanel } from "@/components/host/v2/sheet-panel";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  listPaymentCopySourcesAction,
  loadPaymentCopyPayloadAction,
} from "@/lib/actions/listing-payment-copy.actions";
// Types from the pure module rather than the service: the service is `server-only`, and
// a client component should not name it even in an erased import.
import type { PaymentCopyPayload, PaymentCopySource } from "@/lib/payments/payment-copy";
import { detailsMapToDraft } from "./payment-arrangements-model";
import type { PaymentArrangementsDraft } from "./payment-arrangements-model";
import { methodSourceName } from "./payment-method-names";

/** What a copy hands back to the editor: a whole answer, never a partial merge. */
export type PaymentCopyPatch = Pick<
  PaymentArrangementsDraft,
  "methodCodes" | "otherLabel" | "instructionTemplates" | "details"
>;

/**
 * "Copy payment details from another listing."
 *
 * A host with four apartments has one bank account, and typing the same IBAN four times
 * is both tedious and the single best way to get one of them wrong. This fills the
 * editor's draft from a listing that already has a saved answer.
 *
 * It fills the *draft*, never the database. The host sees the copied methods and details
 * in the form they were already looking at, can undo it by leaving the page, and the
 * section's own Save is still the only thing that writes — which is also what stamps
 * `paymentMethodsReviewedAt`, so a copy can never mark an unread answer as reviewed.
 *
 * A snapshot and not a link: editing the source listing later does not reach back into
 * anything copied from it, and bookings that already froze their instructions are
 * untouched by construction. The sheet says so, because a host who assumed otherwise
 * would go on quoting a closed account.
 *
 * The whole answer moves or none of it does. Copying methods without their details, or
 * one method out of five, leaves a listing half-configured in a way that is harder to
 * spot than an empty one.
 *
 * Renders nothing at all when the host has no other listing with a saved answer. A
 * button offering to copy from nowhere is worse than no button.
 */
export function PaymentCopyFromListing({
  excludeListingId,
  hasAnswer,
  disabled = false,
  onCopy,
}: {
  /** The listing being edited, so a host is never offered a copy of itself. */
  excludeListingId?: string;
  /** True once the target has methods of its own, which changes what this promises. */
  hasAnswer: boolean;
  disabled?: boolean;
  /** Applies the copied answer to the editor's draft. */
  onCopy: (patch: PaymentCopyPatch) => void;
}) {
  const i18n = useI18n();
  const [sources, setSources] = useState<PaymentCopySource[] | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let live = true;
    listPaymentCopySourcesAction(excludeListingId)
      .then((result) => {
        if (live) setSources("sources" in result ? result.sources : []);
      })
      // A picker that cannot list anything is simply not offered. There is nothing for
      // the host to do about it, and the form beside it still works.
      .catch(() => {
        if (live) setSources([]);
      });
    return () => {
      live = false;
    };
  }, [excludeListingId]);

  if (!sources || sources.length === 0) return null;

  function apply(payload: PaymentCopyPayload) {
    onCopy({
      methodCodes: payload.methods,
      otherLabel: payload.otherLabel,
      instructionTemplates: payload.instructionTemplates,
      details: detailsMapToDraft(payload.details),
    });
  }

  async function choose(source: PaymentCopySource) {
    setPendingId(source.id);
    setFailed(false);
    try {
      const result = await loadPaymentCopyPayloadAction(source.id);
      if ("error" in result) throw new Error(result.error);
      apply(result.payload);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {hasAnswer ? (
        // Quiet once the section has an answer: the host came here to edit that answer,
        // not to replace it, and a full-width card would compete with the form.
        <div className="mt-3 flex justify-end">
          <CopyTrigger
            triggerRef={trigger}
            disabled={disabled}
            onClick={() => setOpen(true)}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="min-w-[12rem] flex-1 text-sm leading-6 text-slate-600">
            <Tx
              k="host.editor.payment_arrangements.copy_prompt"
              source="Already set this up on another listing? Copy it here instead of typing it again."
            />
          </p>
          <CopyTrigger
            triggerRef={trigger}
            disabled={disabled}
            onClick={() => setOpen(true)}
          />
        </div>
      )}

      <SheetPanel
        open={open}
        onClose={() => setOpen(false)}
        returnFocusTo={trigger}
        title={
          i18n.resolve(
            "host.editor.payment_arrangements.copy_sheet_title",
            "Copy from another listing",
          ).text
        }
        description={
          i18n.resolve(
            "host.editor.payment_arrangements.copy_sheet_description",
            "Choose a listing. Its payment methods and saved details are copied into this form for you to check.",
          ).text
        }
      >
        {hasAnswer ? (
          // Said before the choice, not after it: this listing's own answer is about to
          // disappear from the form, and a host should know that before they click.
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <Tx
              k="host.editor.payment_arrangements.copy_replaces"
              source="This replaces the methods and details currently in this form. Nothing changes until you save."
            />
          </p>
        ) : null}

        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {sources.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                disabled={pendingId !== null}
                onClick={() => choose(source)}
                className={cn(
                  "flex w-full items-center gap-3 py-3 text-left transition-colors",
                  "hover:bg-slate-50 focus-visible:bg-slate-50 disabled:opacity-60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-sm font-medium text-slate-900"
                    translate="no"
                  >
                    {source.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {source.methods
                      .map((code) =>
                        methodSourceName(code, source.otherLabel, i18n.resolve),
                      )
                      .join(" · ")}
                  </span>
                  {source.detailCount > 0 ? (
                    <span className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-slate-500">
                      <ShieldCheck
                        className="size-3.5 shrink-0 text-slate-400"
                        aria-hidden
                      />
                      <Tx
                        k="host.editor.payment_arrangements.copy_includes_details"
                        source="Includes saved private details"
                      />
                    </span>
                  ) : null}
                </span>
                {pendingId === source.id ? (
                  <LoaderCircle
                    className="size-4 shrink-0 animate-spin text-slate-400"
                    aria-hidden
                  />
                ) : (
                  <Copy className="size-4 shrink-0 text-slate-400" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>

        {failed ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-rose-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <Tx
              k="host.editor.payment_arrangements.copy_failed"
              source="That listing could not be copied. Check your connection and try again."
            />
          </p>
        ) : null}

        <p className="text-xs leading-5 text-slate-500">
          <Tx
            k="host.editor.payment_arrangements.copy_snapshot_note"
            source="This copies the details as they are now. Changing them on the other listing later will not change them here."
          />
        </p>
      </SheetPanel>
    </>
  );
}

/** The one trigger both placements use, so the two never drift apart. */
function CopyTrigger({
  triggerRef,
  disabled,
  onClick,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2",
        "text-sm font-medium text-slate-900 transition-colors",
        "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <Copy className="size-4 shrink-0" aria-hidden />
      <Tx
        k="host.editor.payment_arrangements.copy_button"
        source="Copy from another listing"
      />
    </button>
  );
}
