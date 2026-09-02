"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Bitcoin,
  Banknote,
  Check,
  CircleAlert,
  Clock3,
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
import { EDITOR_GROUP_HEADING } from "@/components/host/v2/editor/editor-group";
import { Input } from "@/components/ui/input";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  maskedPaymentDetailsSummary,
  methodSupportsPaymentDetails,
  type PaymentDetailFieldValues,
} from "@/lib/payments/payment-details";
import { PaymentDetailsSheet } from "./payment-details-sheet";
import { SectionSaveRow, SectionStatusLine } from "./section-save-row";
import {
  PAYMENT_METHOD_CODES,
  draftAfterMethodToggle,
  drawerAfterMethodToggle,
  normalizePaymentArrangementsDraft,
  normalizePaymentMethodCodes,
  paymentArrangementsAreComplete,
  paymentDetailIssues,
  paymentMethodDetailState,
  paymentMethodRowId,
  samePaymentArrangementsDraft,
  validateOtherPaymentLabel,
  type OtherPaymentLabelIssue,
  type PaymentArrangementsDraft,
  type PaymentArrangementsValue,
  type PaymentMethodCode,
  type PaymentMethodDetailState,
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
  const i18n = useI18n();
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
   * The one method whose details are open, if any.
   *
   * One value, so exactly one drawer can be open — there is no state in which two are.
   * Selecting a method is a separate act from opening it: the checkbox says "I accept
   * this", the "Add details" button says "show me its fields", and a host can do either
   * without the other. Ticking a box does not open anything.
   */
  const [openDetails, setOpenDetails] = useState<PaymentMethodCode | null>(null);
  /** The button the drawer was opened from, so focus goes back to it on dismissal. */
  const detailsTrigger = useRef<HTMLButtonElement | null>(null);
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
    // Unsaved text survives a method being switched off and back on; the save
    // normalizer removes anything left against a method that stays unselected.
    publishChange(draftAfterMethodToggle(draft, code, checked));
    setOpenDetails((open) => drawerAfterMethodToggle(open, code, checked));
  }

  function openDetailsFor(code: PaymentMethodCode, trigger: HTMLButtonElement | null) {
    detailsTrigger.current = trigger;
    setOpenDetails(code);
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

  const openLegacyText = openDetails
    ? (draft.instructionTemplates?.[openDetails]?.trim() ?? "")
    : "";

  return (
    <div className={cn("mx-auto w-full max-w-3xl", showHeader && "pt-1")}>
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

      <form onSubmit={submit} noValidate className={showHeader ? "mt-8" : "mt-6"}>
        <fieldset
          disabled={busy}
          aria-invalid={showRequiredError && draft.methodCodes.length === 0}
          aria-describedby={
            showRequiredError && draft.methodCodes.length === 0
              ? "payment-methods-hint payment-methods-error"
              : "payment-methods-hint"
          }
        >
          <legend className={EDITOR_GROUP_HEADING}>
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

          {/* One notice, once. Repeating a warning under every field trains hosts to
              skip it; the field-level messages appear only when they apply. A line
              rather than a panel — it is a standing fact, not an alert. */}
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <Tx
              k="host.editor.payment_arrangements.privacy_notice"
              source="Guests see only the payment method names while browsing. Private details are shared only after you accept a booking."
            />
          </p>

          <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            {PAYMENT_METHOD_CODES.map((code) => (
              <MethodRow
                key={code}
                code={code}
                draft={draft}
                checked={draft.methodCodes.includes(code)}
                disabled={busy}
                onToggle={(checked) => changeMethod(code, checked)}
                onOpenDetails={(trigger) => openDetailsFor(code, trigger)}
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

        {showGuestPreview ? (
          <GuestPreview
            draft={draft}
            showMethods={(reviewed || dirty) && draft.methodCodes.length > 0}
          />
        ) : null}

        {showSubmit ? (
          <SectionSaveRow
            saving={effectiveSaveState === "saving"}
            disabled={busy || !canSubmit}
            status={
              <SaveStatus
                state={effectiveSaveState}
                reviewed={reviewed}
                errorMessage={errorMessage}
              />
            }
            label={
              <Tx
                k="host.editor.payment_arrangements.save_button"
                source="Save payment methods"
              />
            }
            savingLabel={
              <Tx
                k="host.editor.payment_arrangements.saving_button"
                source="Saving…"
              />
            }
          />
        ) : null}
      </form>

      {/* Mounted once, outside the list, and driven by a single method code: two detail
          drawers cannot be open because there is nowhere to say that they are. */}
      <PaymentDetailsSheet
        code={openDetails}
        draft={draft}
        issues={openDetails ? detailIssues[openDetails] : undefined}
        legacyText={openLegacyText}
        showLegacy={Boolean(openLegacyText) && !(openDetails && converting.includes(openDetails))}
        disabled={busy}
        title={
          openDetails ? methodSourceName(openDetails, draft.otherLabel, i18n.resolve) : ""
        }
        returnFocusTo={detailsTrigger}
        onClose={() => setOpenDetails(null)}
        onFieldChange={(key, value) => {
          if (openDetails) changeDetailField(openDetails, key, value);
        }}
        onConvert={() => {
          if (!openDetails) return;
          setConverting((current) =>
            current.includes(openDetails) ? current : [...current, openDetails],
          );
        }}
      />
    </div>
  );
}

/**
 * One method: a checkbox that selects it, and a button that opens its details drawer.
 *
 * The two controls are deliberately separate and are never nested inside one another —
 * the label wraps text only, so clicking the name toggles the checkbox and nothing else
 * competes for the same click. Ticking the box does not open the drawer: a host adding
 * four methods in a row should not have to dismiss four drawers to do it.
 */
function MethodRow({
  code,
  draft,
  checked,
  disabled,
  onToggle,
  onOpenDetails,
}: {
  code: PaymentMethodCode;
  draft: PaymentArrangementsDraft;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  /** The trigger element comes back so focus can be returned to it on dismissal. */
  onOpenDetails: (trigger: HTMLButtonElement | null) => void;
}) {
  const i18n = useI18n();
  const presentation = methodPresentation(code);
  const Icon = presentation.icon;
  const base = rowId(code);
  const checkboxId = paymentMethodRowId(code);
  const statusId = `payment-status-${base}`;

  const supportsDetails = methodSupportsPaymentDetails(code);
  const values = draft.details?.[code] ?? {};
  const state = paymentMethodDetailState(draft, code);
  const summary = maskedPaymentDetailsSummary(code, values);
  const methodName = methodSourceName(code, draft.otherLabel, i18n.resolve);

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
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
        {/* The label is the whole hit target for selection and wraps text only, so the
            row stays a checkbox and the detail button stays a button. */}
        <label
          htmlFor={checkboxId}
          className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center py-1.5"
        >
          <span className="block text-sm font-medium text-slate-900">
            {presentation.label}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
            {presentation.description}
          </span>
        </label>

        {checked && supportsDetails ? (
          <div className="flex items-center gap-3 pl-8 sm:pl-0">
            {summary ? (
              <span
                className="hidden font-mono text-xs text-slate-400 sm:inline"
                translate="no"
              >
                {summary}
              </span>
            ) : null}
            {/* Words, not a coloured pill: the status has to survive a greyscale
                screenshot and be read out with the checkbox it describes. */}
            <span
              id={statusId}
              className={cn(
                "text-xs",
                state === "ATTENTION" ? "text-rose-700" : "text-slate-500",
              )}
            >
              <DetailStateLabel state={state} />
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => onOpenDetails(event.currentTarget)}
              aria-haspopup="dialog"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-sm font-semibold text-slate-700 underline-offset-4 transition-colors hover:text-slate-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "NONE" ? (
                <Tx
                  k="host.editor.payment_arrangements.add_details"
                  source="Add details"
                />
              ) : (
                <Tx
                  k="host.editor.payment_arrangements.edit_details"
                  source="Edit details"
                />
              )}
              {/* Screen readers get the method too, so "Edit details" is never one of
                  ten identical buttons in the list of controls. */}
              <span className="sr-only"> — {methodName}</span>
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * What a selected method's details are, in words.
 *
 * "Details added", never "saved": this screen holds a local draft, and the section's
 * Save button below is the only thing that writes it.
 */
function DetailStateLabel({ state }: { state: PaymentMethodDetailState }) {
  switch (state) {
    case "ATTENTION":
      return (
        <Tx
          k="host.editor.payment_arrangements.status_attention"
          source="Needs attention"
        />
      );
    case "ADDED":
      return (
        <Tx
          k="host.editor.payment_arrangements.status_ready"
          source="Details added"
        />
      );
    default:
      return (
        <Tx k="host.editor.payment_arrangements.status_missing" source="Optional" />
      );
  }
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
    <div className="mt-5 max-w-sm">
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
        className="mt-2 h-12 text-base md:h-10 md:text-sm"
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
    // A sentence, not a dashboard card. It restates the current draft in the words a
    // guest reads it in, which is the only thing this section is for — a framed panel
    // around three lines of prose would outrank the controls it is summarising.
    <section className="mt-6" aria-labelledby="payment-guest-preview-heading">
      <h2
        id="payment-guest-preview-heading"
        className="text-sm font-semibold text-slate-900"
      >
        <Tx
          k="host.editor.payment_arrangements.preview_heading"
          source="What guests will see"
        />
      </h2>
      {showMethods ? (
        <>
          <p className="mt-1 text-sm leading-6 text-slate-800">
            {methods.map((code, index) => (
              <span key={code}>
                {index > 0 ? ", " : null}
                <MethodLabel code={code} otherLabel={draft.otherLabel} />
              </span>
            ))}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            <Tx
              k="host.editor.payment_arrangements.reviewed_explanation"
              source="The host will share payment instructions after accepting your request."
            />
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm leading-6 text-slate-500">
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
    <SectionStatusLine tone={state === "error" ? "error" : "muted"}>
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
    </SectionStatusLine>
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
      return resolve("host.editor.payment_arrangements.bank_local", "Bank transfer (local or Europe)").text;
    case "BANK_TRANSFER_INTERNATIONAL":
      return resolve("host.editor.payment_arrangements.bank_international", "Bank transfer (other countries)").text;
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
            source="Bank transfer (local or Europe)"
          />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.bank_local_description"
            source="The guest sends money from their bank to yours. Use it for transfers inside your country and across Europe (also called SEPA)."
          />
        ),
      };
    case "BANK_TRANSFER_INTERNATIONAL":
      return {
        icon: Globe2,
        label: (
          <Tx
            k="host.editor.payment_arrangements.bank_international"
            source="Bank transfer (other countries)"
          />
        ),
        description: (
          <Tx
            k="host.editor.payment_arrangements.bank_international_description"
            source="For a guest whose bank is outside Europe. These transfers are usually slower and cost more."
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
