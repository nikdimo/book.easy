"use client";

import { useState, type FormEvent } from "react";
import {
  Bitcoin,
  Banknote,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Eye,
  Globe2,
  Landmark,
  Link2,
  LoaderCircle,
  MessageCircleMore,
  MoreHorizontal,
  ShieldCheck,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  PAYMENT_DETAIL_FIELDS,
  maskedPaymentDetailsSummary,
  methodSupportsPaymentDetails,
  type PaymentDetailFieldValues,
  type PaymentDetailIssues,
} from "@/lib/payments/payment-details";
import {
  PaymentDetailFields,
  FieldIssueMessage,
} from "./payment-detail-fields";
import {
  PAYMENT_METHOD_CODES,
  normalizePaymentArrangementsDraft,
  normalizePaymentMethodCodes,
  paymentArrangementsAreComplete,
  paymentDetailIssues,
  paymentMethodDetailsStatus,
  paymentMethodRowId,
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
  /** Listing creation owns navigation in its fixed footer, so it reuses the fields
   * without rendering this editor's standalone save row. */
  showSubmit?: boolean;
  /**
   * Whether the "choose a method" message and the matching `aria-invalid` are rendered
   * while nothing is selected.
   *
   * True on the post-publish editor, which is a page about one saved answer and can say
   * so the moment it is empty. The wizard turns it off until the host presses Next:
   * a step that opens already covered in red tells a host they got something wrong
   * before anyone has asked them anything.
   */
  showRequiredError?: boolean;
  /** The wizard leads with its own "Your payment terms" summary, which already states
   *  what a guest will see, so it suppresses this second preview of the same answer. */
  showGuestPreview?: boolean;
  /** The wizard supplies the screen's own heading and intro above this editor, so it
   *  suppresses these rather than putting a second h1 in the middle of the page. */
  showHeader?: boolean;
};

type MethodPresentation = {
  icon: LucideIcon;
  label: React.ReactNode;
  description: React.ReactNode;
};

function rowId(code: PaymentMethodCode) {
  return code.toLowerCase().replaceAll("_", "-");
}

export function PaymentArrangementsEditor({
  initialValue,
  onSave,
  onChange,
  saveState,
  errorMessage,
  disabled = false,
  showSubmit = true,
  showRequiredError = true,
  showGuestPreview = true,
  showHeader = true,
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
  /**
   * Exactly one method's details are open at a time. Selecting a method is a separate
   * act from opening it: the checkbox says "I accept this", the disclosure button says
   * "show me its fields", and a host can do either without the other.
   */
  const [expanded, setExpanded] = useState<PaymentMethodCode | null>(null);
  /** Methods whose legacy paragraph the host chose to replace with structured fields. */
  const [converting, setConverting] = useState<PaymentMethodCode[]>([]);

  const effectiveSaveState = saveState ?? localSaveState;
  const busy = disabled || effectiveSaveState === "saving";
  const isComplete = paymentArrangementsAreComplete(draft);
  const dirty = !samePaymentArrangementsDraft(draft, confirmed);
  const otherIssue = draft.methodCodes.includes("OTHER")
    ? validateOtherPaymentLabel(draft.otherLabel ?? "")
    : null;
  const detailIssues = paymentDetailIssues(draft);
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
      // Keep unsaved text while a host toggles a method off and back on. The save
      // normalizer removes anything left against a method that stays unselected.
      instructionTemplates: draft.instructionTemplates ?? {},
      details: draft.details ?? {},
    });
    // Selecting a method opens it, so its fields are one click away rather than
    // somewhere further down the page. Clearing one closes it again.
    if (checked && methodSupportsPaymentDetails(code)) setExpanded(code);
    else if (!checked && expanded === code) setExpanded(null);
  }

  function changeDetailField(
    code: PaymentMethodCode,
    key: string,
    value: string,
  ) {
    const current = draft.details?.[code] ?? {};
    const nextValues: PaymentDetailFieldValues = { ...current, [key]: value };
    publishChange({
      ...draft,
      details: { ...(draft.details ?? {}), [code]: nextValues },
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
      setConverting([]);
    } catch {
      setLocalSaveState("error");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-6 pb-12 md:py-10 md:pb-14">
      {showHeader ? (
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
              source="Choose every payment method you accept. You can also save private details to reuse after accepting a booking."
            />
          </p>
        </header>
      ) : null}

      {/* One notice, once. Repeating a warning under every field trains hosts to
          skip it; the field-level messages below appear only when they apply. */}
      <p className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-5 text-slate-600">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
        <Tx
          k="host.editor.payment_arrangements.privacy_notice"
          source="Guests see only the payment method names while browsing. Private details are shared only after you accept a booking."
        />
      </p>

      <form onSubmit={submit} noValidate className="mt-6">
        <fieldset
          disabled={busy}
          aria-invalid={showRequiredError && draft.methodCodes.length === 0}
          aria-describedby={
            showRequiredError && draft.methodCodes.length === 0
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

          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {PAYMENT_METHOD_CODES.map((code) => (
              <MethodRow
                key={code}
                code={code}
                draft={draft}
                checked={draft.methodCodes.includes(code)}
                expanded={expanded === code}
                converting={converting.includes(code)}
                issues={detailIssues[code]}
                disabled={busy}
                onToggle={(checked) => changeMethod(code, checked)}
                onExpandedChange={(open) => setExpanded(open ? code : null)}
                onFieldChange={(key, value) => changeDetailField(code, key, value)}
                onConvert={() => {
                  setConverting((current) =>
                    current.includes(code) ? current : [...current, code],
                  );
                  setExpanded(code);
                }}
              />
            ))}
          </ul>
        </fieldset>

        {draft.methodCodes.includes("OTHER") ? (
          <OtherMethodField
            value={draft.otherLabel ?? ""}
            issue={otherIssue}
            disabled={busy}
            onChange={(otherLabel) => publishChange({ ...draft, otherLabel })}
          />
        ) : null}

        {showGuestPreview ? (
          <GuestPreview
            draft={draft}
            showMethods={(reviewed || dirty) && draft.methodCodes.length > 0}
          />
        ) : null}

        {showRequiredError && draft.methodCodes.length === 0 ? (
          // Not a live region: the fieldset already points `aria-describedby` at it, and
          // the wizard raises one summary alert for the whole screen. A second alert
          // here would announce the same refusal twice.
          <p
            id="payment-methods-error"
            className="mt-4 flex items-start gap-2 text-sm text-rose-700"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <Tx
              k="host.editor.payment_arrangements.method_required"
              source="Choose at least one way guests can pay."
            />
          </p>
        ) : null}

        {showSubmit ? <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
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
        </div> : null}
      </form>
    </div>
  );
}

/**
 * One method: a checkbox that selects it, and a disclosure button that opens its fields.
 *
 * The two controls are deliberately separate and are never nested inside one another —
 * the label wraps text only, so clicking the name toggles the checkbox and nothing else
 * competes for the same click.
 */
function MethodRow({
  code,
  draft,
  checked,
  expanded,
  converting,
  issues,
  disabled,
  onToggle,
  onExpandedChange,
  onFieldChange,
  onConvert,
}: {
  code: PaymentMethodCode;
  draft: PaymentArrangementsDraft;
  checked: boolean;
  expanded: boolean;
  converting: boolean;
  issues: PaymentDetailIssues | undefined;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
  onFieldChange: (key: string, value: string) => void;
  onConvert: () => void;
}) {
  const i18n = useI18n();
  const presentation = methodPresentation(code);
  const Icon = presentation.icon;
  const base = rowId(code);
  const checkboxId = paymentMethodRowId(code);
  const panelId = `payment-details-${base}`;
  const statusId = `payment-status-${base}`;

  const supportsDetails = methodSupportsPaymentDetails(code);
  const values = draft.details?.[code] ?? {};
  const legacyText = draft.instructionTemplates?.[code]?.trim() ?? "";
  const showLegacy = Boolean(legacyText) && !converting;
  const status = paymentMethodDetailsStatus(draft, code);
  const summary = maskedPaymentDetailsSummary(code, values);
  const methodName = methodSourceName(code, draft.otherLabel, i18n.resolve);
  const hasIssues = Boolean(issues && Object.keys(issues).length > 0);

  return (
    <li className={cn(checked && "bg-slate-50/60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <input
          id={checkboxId}
          name="payment-methods"
          type="checkbox"
          value={code}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          aria-describedby={checked && supportsDetails ? statusId : undefined}
          className="size-5 shrink-0 cursor-pointer accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        />
        <Icon
          className={cn(
            "size-5 shrink-0",
            checked ? "text-slate-900" : "text-slate-400",
          )}
          aria-hidden
        />
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-semibold text-slate-900">
            {presentation.label}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
            {presentation.description}
          </span>
        </label>

        {checked && supportsDetails ? (
          <div className="flex items-center gap-2">
            <span
              id={statusId}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                status === "READY"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-slate-100 text-slate-600",
              )}
            >
              {status === "READY" ? (
                <Tx
                  k="host.editor.payment_arrangements.status_ready"
                  source="Details saved"
                />
              ) : (
                <Tx
                  k="host.editor.payment_arrangements.status_missing"
                  source="Optional details"
                />
              )}
            </span>
            {summary ? (
              <span
                className="hidden font-mono text-xs text-slate-500 sm:inline"
                translate="no"
              >
                {summary}
              </span>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onExpandedChange(!expanded)}
              aria-expanded={expanded}
              aria-controls={panelId}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "READY" ? (
                <Tx
                  k="host.editor.payment_arrangements.edit_details"
                  source="Edit details"
                />
              ) : (
                <Tx
                  k="host.editor.payment_arrangements.add_details"
                  source="Add details"
                />
              )}
              <span className="sr-only"> — {methodName}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  expanded && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          </div>
        ) : null}
      </div>

      {checked && supportsDetails ? (
        // The panel stays mounted and is hidden rather than unmounted, so a host who
        // collapses a row mid-edit keeps their cursor position and their unsaved text,
        // and `aria-controls` always resolves to a real element.
        <div
          id={panelId}
          role="group"
          aria-label={methodName}
          hidden={!expanded}
          className={cn(!expanded && "hidden", "border-t border-slate-200 bg-white p-4 sm:p-5")}
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
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
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
                onChange={onFieldChange}
              />
              {issues?._ ? (
                <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-rose-700">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <FieldIssueMessage issue={issues._} />
                </p>
              ) : null}
              {!hasIssues && PAYMENT_DETAIL_FIELDS[code].some((f) => f.required) ? (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  <Tx
                    k="host.editor.payment_arrangements.details_optional_now"
                    source="You can leave these blank and share the details when you accept a booking."
                  />
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
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
        className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 font-sans text-xs leading-5 text-slate-800"
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
        className="mt-3"
      >
        <Tx
          k="host.editor.payment_arrangements.legacy_convert"
          source="Convert to structured fields"
        />
      </Button>
    </div>
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

function MethodLabel({
  code,
  otherLabel,
}: {
  code: PaymentMethodCode;
  otherLabel: string | null;
}) {
  if (code === "OTHER") {
    const trimmed = (otherLabel ?? "").trim();
    if (trimmed) return <span translate="no">{trimmed}</span>;
    return (
      <Tx
        k="host.editor.payment_arrangements.other"
        source="Another payment method"
      />
    );
  }
  return <>{methodPresentation(code).label}</>;
}

/** Plain-text method name, for an accessible label or an aria-label. */
function methodSourceName(
  code: PaymentMethodCode,
  otherLabel: string | null,
  resolve: ReturnType<typeof useI18n>["resolve"],
): string {
  switch (code) {
    case "CASH_AT_PROPERTY":
      return resolve("host.editor.payment_arrangements.cash", "Cash at the property").text;
    case "BANK_TRANSFER_LOCAL_SEPA":
      return resolve("host.editor.payment_arrangements.bank_local", "Local or SEPA bank transfer").text;
    case "BANK_TRANSFER_INTERNATIONAL":
      return resolve("host.editor.payment_arrangements.bank_international", "International bank transfer").text;
    case "PAYPAL":
      return resolve("host.editor.payment_arrangements.paypal", "PayPal").text;
    case "REVOLUT":
      return resolve("host.editor.payment_arrangements.revolut", "Revolut").text;
    case "WISE":
      return resolve("host.editor.payment_arrangements.wise", "Wise").text;
    case "BITCOIN":
      return resolve("host.editor.payment_arrangements.bitcoin", "Bitcoin").text;
    case "HOST_SECURE_CARD_LINK":
      return resolve("host.editor.payment_arrangements.secure_card_link", "Secure card payment link from host").text;
    case "OTHER":
      return (
        (otherLabel ?? "").trim() ||
        resolve("host.editor.payment_arrangements.other", "Another payment method").text
      );
    case "ARRANGE_DIRECTLY":
      return resolve("host.editor.payment_arrangements.arrange_directly", "Arrange directly after the booking request").text;
  }
}

function methodPresentation(code: PaymentMethodCode): MethodPresentation {
  switch (code) {
    case "CASH_AT_PROPERTY":
      return {
        icon: Banknote,
        label: (
          <Tx
            k="host.editor.payment_arrangements.cash"
            source="Cash at the property"
          />
        ),
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
        label: (
          <Tx k="host.editor.payment_arrangements.paypal" source="PayPal" />
        ),
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
        label: (
          <Tx k="host.editor.payment_arrangements.revolut" source="Revolut" />
        ),
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
    case "BITCOIN":
      return {
        icon: Bitcoin,
        label: (
          <Tx k="host.editor.payment_arrangements.bitcoin" source="Bitcoin" />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.bitcoin_description"
            source="Accept Bitcoin to a public wallet address you provide after acceptance."
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
