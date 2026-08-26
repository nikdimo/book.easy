"use client";

import { useState, type FormEvent } from "react";
import {
  Banknote,
  Check,
  CircleAlert,
  Clock3,
  Eye,
  Globe2,
  Landmark,
  Link2,
  LoaderCircle,
  MessageCircleMore,
  MoreHorizontal,
  ShieldAlert,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHOD_CODES,
  normalizePaymentArrangementsDraft,
  normalizePaymentMethodCodes,
  paymentArrangementsAreComplete,
  samePaymentArrangementsDraft,
  togglePaymentMethod,
  validateOtherPaymentLabel,
  type OtherPaymentLabelIssue,
  type PaymentArrangementsDraft,
  type PaymentArrangementsValue,
  type PaymentMethodCode,
} from "./payment-arrangements-model";

export type PaymentArrangementsSaveState =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

export type PaymentArrangementsChangeMeta = {
  isComplete: boolean;
};

export type PaymentArrangementsEditorProps = {
  initialValue: PaymentArrangementsValue;
  /** Persist the public method selection. Reject the promise when the save fails. */
  onSave: (draft: PaymentArrangementsDraft) => void | Promise<void>;
  onChange?: (
    draft: PaymentArrangementsDraft,
    meta: PaymentArrangementsChangeMeta,
  ) => void;
  /** Optional controlled status for an integrating route that already owns save state. */
  saveState?: PaymentArrangementsSaveState;
  /** A safe, user-facing error. Raw server or provider errors should not be passed here. */
  errorMessage?: string;
  disabled?: boolean;
};

type MethodPresentation = {
  icon: LucideIcon;
  label: React.ReactNode;
  description: React.ReactNode;
};

export function PaymentArrangementsEditor({
  initialValue,
  onSave,
  onChange,
  saveState,
  errorMessage,
  disabled = false,
}: PaymentArrangementsEditorProps) {
  const [draft, setDraft] = useState<PaymentArrangementsDraft>(() =>
    normalizePaymentArrangementsDraft(initialValue),
  );
  const [confirmed, setConfirmed] = useState<PaymentArrangementsDraft>(() =>
    normalizePaymentArrangementsDraft(initialValue),
  );
  const [localSaveState, setLocalSaveState] = useState<PaymentArrangementsSaveState>(
    initialValue.reviewedAt ? "saved" : "idle",
  );
  const [reviewed, setReviewed] = useState(Boolean(initialValue.reviewedAt));

  const effectiveSaveState = saveState ?? localSaveState;
  const busy = disabled || effectiveSaveState === "saving";
  const isComplete = paymentArrangementsAreComplete(draft);
  const dirty = !samePaymentArrangementsDraft(draft, confirmed);
  const otherIssue = draft.methodCodes.includes("OTHER")
    ? validateOtherPaymentLabel(draft.otherLabel ?? "")
    : null;
  const canSubmit = isComplete && (dirty || !reviewed);

  function publishChange(next: PaymentArrangementsDraft) {
    setDraft(next);
    setLocalSaveState("pending");
    onChange?.(next, { isComplete: paymentArrangementsAreComplete(next) });
  }

  function changeMethod(code: PaymentMethodCode, checked: boolean) {
    const methodCodes = togglePaymentMethod(draft.methodCodes, code, checked);
    publishChange({
      methodCodes,
      otherLabel: methodCodes.includes("OTHER") ? (draft.otherLabel ?? "") : null,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSubmit) return;

    const payload = normalizePaymentArrangementsDraft(draft);
    setLocalSaveState("saving");
    try {
      await onSave(payload);
      setConfirmed(payload);
      setDraft(payload);
      setReviewed(true);
      setLocalSaveState("saved");
    } catch {
      setLocalSaveState("error");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-6 pb-12 md:py-10 md:pb-14">
      <header>
        <h1 className="sr-only">
          <Tx
            k="host.editor.payment_arrangements.heading"
            source="Payment arrangements"
          />
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          <Tx
            k="host.editor.payment_arrangements.intro"
            source="Choose every payment method you accept. Guests see the method names only—never account details or payment instructions."
          />
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <InfoCard
          icon={Eye}
          title={
            <Tx
              k="host.editor.payment_arrangements.public_names_title"
              source="Guests see names, not details"
            />
          }
        >
          <Tx
            k="host.editor.payment_arrangements.public_names_body"
            source="Only the selected method names appear publicly. You share any necessary instructions privately after accepting a request."
          />
        </InfoCard>
        <InfoCard
          icon={ShieldAlert}
          tone="warning"
          title={
            <Tx
              k="host.editor.payment_arrangements.safety_title"
              source="Keep sensitive details out"
            />
          }
        >
          <Tx
            k="host.editor.payment_arrangements.safety_body"
            source="Do not enter account numbers, IBAN or SWIFT codes, payment handles, links, card details, phone numbers, or payment instructions."
          />
        </InfoCard>
      </div>

      <form onSubmit={submit} noValidate className="mt-8">
        <fieldset
          disabled={busy}
          aria-invalid={!isComplete && draft.methodCodes.length === 0}
          aria-describedby={
            draft.methodCodes.length === 0
              ? "payment-methods-hint payment-methods-error"
              : "payment-methods-hint"
          }
        >
          <legend className="text-base font-semibold text-slate-900">
            <Tx
              k="host.editor.payment_arrangements.methods_legend"
              source="Accepted payment methods"
            />
          </legend>
          <p id="payment-methods-hint" className="mt-1 text-sm leading-6 text-slate-500">
            <Tx
              k="host.editor.payment_arrangements.methods_hint"
              source="Select all that apply, or choose Arrange directly on its own."
            />
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {PAYMENT_METHOD_CODES.map((code) => {
              const checked = draft.methodCodes.includes(code);
              const presentation = methodPresentation(code);
              const Icon = presentation.icon;
              const isDirect = code === "ARRANGE_DIRECTLY";
              const id = `payment-method-${code.toLowerCase().replaceAll("_", "-")}`;

              return (
                <label
                  key={code}
                  htmlFor={id}
                  className={cn(
                    "group flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition-colors",
                    "hover:border-slate-400 hover:bg-slate-50/70 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200",
                    "has-disabled:cursor-not-allowed has-disabled:opacity-60",
                    checked
                      ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                      : "border-slate-200",
                    isDirect && "sm:col-span-2",
                  )}
                >
                  <input
                    id={id}
                    name="payment-methods"
                    type="checkbox"
                    value={code}
                    checked={checked}
                    onChange={(event) => changeMethod(code, event.currentTarget.checked)}
                    className="mt-0.5 size-5 shrink-0 cursor-pointer accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                  />
                  <Icon
                    className={cn(
                      "mt-0.5 size-5 shrink-0",
                      checked ? "text-slate-900" : "text-slate-400",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {presentation.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {presentation.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {draft.methodCodes.includes("OTHER") ? (
          <OtherMethodField
            value={draft.otherLabel ?? ""}
            issue={otherIssue}
            disabled={busy}
            onChange={(otherLabel) => publishChange({ ...draft, otherLabel })}
          />
        ) : null}

        <GuestPreview
          draft={draft}
          showMethods={(reviewed || dirty) && draft.methodCodes.length > 0}
        />

        {!isComplete && draft.methodCodes.length === 0 ? (
          <p id="payment-methods-error" className="mt-4 text-sm text-rose-700">
            <Tx
              k="host.editor.payment_arrangements.method_required"
              source="Choose at least one payment method to complete this section."
            />
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <SaveStatus
            state={effectiveSaveState}
            reviewed={reviewed}
            errorMessage={errorMessage}
          />
          <Button
            type="submit"
            size="lg"
            disabled={busy || !canSubmit}
            className="w-full rounded-full bg-slate-900 px-6 text-white hover:bg-slate-800 sm:w-auto"
          >
            {effectiveSaveState === "saving" ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden />
                <Tx
                  k="host.editor.payment_arrangements.saving_button"
                  source="Saving…"
                />
              </>
            ) : (
              <Tx
                k="host.editor.payment_arrangements.save_button"
                source="Save payment methods"
              />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  tone = "neutral",
  children,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  tone?: "neutral" | "warning";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border p-4",
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-900",
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
      </h2>
      <p
        className={cn(
          "mt-1.5 text-xs leading-5",
          tone === "warning" ? "text-amber-900" : "text-slate-600",
        )}
      >
        {children}
      </p>
    </section>
  );
}

function OtherMethodField({
  value,
  issue,
  disabled,
  onChange,
}: {
  value: string;
  issue: OtherPaymentLabelIssue | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const i18n = useI18n();
  const count = Array.from(value).length;
  const errorId = issue ? "other-payment-method-error" : undefined;

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor="other-payment-method" className="text-sm font-semibold text-slate-900">
          <Tx
            k="host.editor.payment_arrangements.other_label"
            source="Public method name"
          />
        </label>
        <span className="text-xs tabular-nums text-slate-500" aria-hidden>
          {count}/40
        </span>
      </div>
      <Input
        id="other-payment-method"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        minLength={2}
        maxLength={40}
        disabled={disabled}
        aria-invalid={Boolean(issue)}
        aria-describedby={errorId ?? "other-payment-method-hint"}
        autoComplete="off"
        spellCheck
        translate="no"
        placeholder={i18n.resolve(
          "host.editor.payment_arrangements.other_placeholder",
          "MobilePay",
        ).text}
        className="mt-2 h-12 bg-white text-base md:h-10 md:text-sm"
      />
      {issue ? (
        <p
          id="other-payment-method-error"
          role="alert"
          className="mt-2 flex items-start gap-2 text-sm leading-5 text-rose-700"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <OtherLabelError issue={issue} />
        </p>
      ) : (
        <p id="other-payment-method-hint" className="mt-2 text-xs leading-5 text-slate-500">
          <Tx
            k="host.editor.payment_arrangements.other_hint"
            source="Use 2–40 characters for the method name only, such as MobilePay."
          />
        </p>
      )}
    </div>
  );
}

function OtherLabelError({ issue }: { issue: OtherPaymentLabelIssue }) {
  switch (issue) {
    case "required":
      return (
        <Tx
          k="host.editor.payment_arrangements.other_required"
          source="Enter the public name of this payment method."
        />
      );
    case "too_short":
      return (
        <Tx
          k="host.editor.payment_arrangements.other_too_short"
          source="Use at least 2 characters."
        />
      );
    case "too_long":
      return (
        <Tx
          k="host.editor.payment_arrangements.other_too_long"
          source="Use no more than 40 characters."
        />
      );
    case "contact_or_payment_details":
      return (
        <Tx
          k="host.editor.payment_arrangements.other_sensitive"
          source="That looks like contact or payment details. Enter a method name only."
        />
      );
    case "payment_instructions":
      return (
        <Tx
          k="host.editor.payment_arrangements.other_instructions"
          source="Do not include payment instructions. Enter a method name only."
        />
      );
  }
}

function GuestPreview({
  draft,
  showMethods,
}: {
  draft: PaymentArrangementsDraft;
  showMethods: boolean;
}) {
  const methods = normalizePaymentMethodCodes(draft.methodCodes);

  return (
    <section
      className="mt-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      aria-labelledby="payment-guest-preview-heading"
    >
      <div className="flex items-center gap-2">
        <Eye className="size-4 text-slate-500" aria-hidden />
        <h2 id="payment-guest-preview-heading" className="text-sm font-semibold text-slate-900">
          <Tx
            k="host.editor.payment_arrangements.preview_heading"
            source="What guests will see"
          />
        </h2>
      </div>
      {showMethods ? (
        <>
          <ul className="mt-3 flex flex-wrap gap-2">
            {methods.map((code) => (
              <li
                key={code}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800"
              >
                <MethodLabel code={code} otherLabel={draft.otherLabel} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            <Tx
              k="host.editor.payment_arrangements.reviewed_explanation"
              source="The host will share payment instructions after accepting your request."
            />
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          <Tx
            k="host.editor.payment_arrangements.unanswered_fallback"
            source="Payment is arranged directly with the host after the booking request is accepted."
          />
        </p>
      )}
    </section>
  );
}

function SaveStatus({
  state,
  reviewed,
  errorMessage,
}: {
  state: PaymentArrangementsSaveState;
  reviewed: boolean;
  errorMessage?: string;
}) {
  const i18n = useI18n();

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-6 items-center gap-2 text-sm",
        state === "error" ? "text-rose-700" : "text-slate-500",
      )}
    >
      {state === "pending" ? (
        <>
          <Clock3 className="size-4 shrink-0" aria-hidden />
          <Tx
            k="host.editor.payment_arrangements.status_pending"
            source="Changes ready to save"
          />
        </>
      ) : state === "saving" ? (
        <>
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
          <Tx
            k="host.editor.payment_arrangements.status_saving"
            source="Saving payment methods…"
          />
        </>
      ) : state === "saved" || (state === "idle" && reviewed) ? (
        <>
          <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
          <Tx
            k="host.editor.payment_arrangements.status_saved"
            source="Payment methods saved"
          />
        </>
      ) : state === "error" ? (
        <>
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {errorMessage ??
            i18n.resolve(
              "host.editor.payment_arrangements.status_error",
              "Not saved. Check your connection and try again.",
            ).text}
        </>
      ) : (
        <>
          <Clock3 className="size-4 shrink-0" aria-hidden />
          <Tx
            k="host.editor.payment_arrangements.status_unanswered"
            source="Not answered yet"
          />
        </>
      )}
    </p>
  );
}

function methodPresentation(code: PaymentMethodCode): MethodPresentation {
  switch (code) {
    case "CASH_AT_PROPERTY":
      return {
        icon: Banknote,
        label: <Tx k="host.editor.payment_arrangements.cash" source="Cash at the property" />,
        description: (
          <Tx
            k="host.editor.payment_arrangements.cash_description"
            source="The guest pays in person at the stay."
          />
        ),
      };
    case "BANK_TRANSFER_LOCAL_SEPA":
      return {
        icon: Landmark,
        label: (
          <Tx
            k="host.editor.payment_arrangements.bank_local"
            source="Local or SEPA bank transfer"
          />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.bank_local_description"
            source="For domestic or SEPA transfers."
          />
        ),
      };
    case "BANK_TRANSFER_INTERNATIONAL":
      return {
        icon: Globe2,
        label: (
          <Tx
            k="host.editor.payment_arrangements.bank_international"
            source="International bank transfer"
          />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.bank_international_description"
            source="For transfers between countries or banking regions."
          />
        ),
      };
    case "PAYPAL":
      return {
        icon: WalletCards,
        label: <Tx k="host.editor.payment_arrangements.paypal" source="PayPal" />,
        description: (
          <Tx
            k="host.editor.payment_arrangements.paypal_description"
            source="PayPal is available for this listing."
          />
        ),
      };
    case "REVOLUT":
      return {
        icon: WalletCards,
        label: <Tx k="host.editor.payment_arrangements.revolut" source="Revolut" />,
        description: (
          <Tx
            k="host.editor.payment_arrangements.revolut_description"
            source="Revolut is available for this listing."
          />
        ),
      };
    case "WISE":
      return {
        icon: Globe2,
        label: <Tx k="host.editor.payment_arrangements.wise" source="Wise" />,
        description: (
          <Tx
            k="host.editor.payment_arrangements.wise_description"
            source="Wise is available for this listing."
          />
        ),
      };
    case "HOST_SECURE_CARD_LINK":
      return {
        icon: Link2,
        label: (
          <Tx
            k="host.editor.payment_arrangements.secure_card_link"
            source="Secure card payment link from host"
          />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.secure_card_link_description"
            source="You provide your secure card payment option after acceptance."
          />
        ),
      };
    case "OTHER":
      return {
        icon: MoreHorizontal,
        label: (
          <Tx
            k="host.editor.payment_arrangements.other"
            source="Another payment method"
          />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.other_description"
            source="Add a short public name for another method."
          />
        ),
      };
    case "ARRANGE_DIRECTLY":
      return {
        icon: MessageCircleMore,
        label: (
          <Tx
            k="host.editor.payment_arrangements.arrange_directly"
            source="Arrange directly after the booking request"
          />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.arrange_directly_description"
            source="Use this when you do not want to name a method in advance. This option cannot be combined with another method."
          />
        ),
      };
  }
}

function MethodLabel({
  code,
  otherLabel,
}: {
  code: PaymentMethodCode;
  otherLabel: string | null;
}) {
  if (code === "OTHER" && otherLabel?.trim()) {
    return (
      <span className="notranslate" translate="no">
        {otherLabel.trim()}
      </span>
    );
  }
  return <>{methodPresentation(code).label}</>;
}
