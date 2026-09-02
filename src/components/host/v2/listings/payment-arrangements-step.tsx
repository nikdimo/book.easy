"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  Coins,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  DepositSectionFields,
} from "@/components/host/v2/editor/payment-arrangements/deposit-policies-editor";
import {
  PaymentArrangementsEditor,
} from "@/components/host/v2/editor/payment-arrangements/payment-arrangements-editor";
import {
  normalizePaymentArrangementsDraft,
  normalizePaymentMethodCodes,
  type PaymentArrangementsDraft,
  type PaymentDetailsDraftMap,
  type PaymentMethodCode,
} from "@/components/host/v2/editor/payment-arrangements/payment-arrangements-model";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { depositPoliciesCurrency } from "@/lib/host/v2/listing-deposit-draft";
import {
  CANCELLATION_ANCHOR_ID,
  CUSTOM_CANCELLATION_FIELD_ID,
  DEPOSITS_ANCHOR_ID,
  FREE_CANCELLATION_PRESET_DAYS,
  PAYMENT_METHODS_ANCHOR_ID,
  cancellationAnswerFromDraft,
  cancellationSummaryDays,
  depositAnswerFromDraft,
  paymentTermsDraftPatch,
  paymentTermsIssues,
  type CancellationAnswer,
  type CancellationChoice,
  type PaymentTermsIssue,
  type PaymentTermsIssueCode,
} from "@/lib/host/v2/listing-payment-terms";
import type { DepositPoliciesDraft } from "@/lib/host/v2/listing-deposit-draft";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { reviewHref, stepNextTarget } from "@/lib/host/v2/listing-flow-return";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

const SUMMARY_ID = "payment-terms-error-summary";

/**
 * Phase three: how guests pay, and how late they can cancel.
 *
 * Three questions, one screen, and exactly one of them is required — a guest has to
 * know their payment options before they can send a request, so at least one accepted
 * method is asked for and nothing else is.
 *
 * The other two are answered for the host up front, visibly, with the safest answer
 * there is: no advance payment, no damage deposit, and a full refund right up to
 * check-in. Those are not silent defaults. They are shown as the selected choice, they
 * are restated in the summary at the top of the screen, and continuing from here is
 * what writes them — which is also the only thing that ever writes them. A draft that
 * arrives with its own answer keeps it, exactly as saved, defaults or no defaults.
 *
 * What this screen must never do is refuse to continue without saying so. Its CTA is
 * always live: pressing it either moves on, or names every problem in one summary,
 * scrolls to the first one and puts the cursor in it. `paymentTermsIssues` owns that
 * list, in page order, so "the first problem" is the first one the host would meet
 * reading downwards.
 */
export function PaymentArrangementsStep({
  propertyType,
  spaceType,
  returnToReview = false,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Reached from the Review screen's "Edit". */
  returnToReview?: boolean;
}) {
  const { data, save } = useHostStartDraft();
  const { resolve } = useI18n();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  /** Where the CTA goes, what it says, and which route to record so a host who
   *  leaves here resumes on the screen they were heading for. */
  const { href: nextHref, label: nextLabel, route: nextRoute } = stepNextTarget(
    returnToReview,
    query,
    `/host/start/availability?${query}`,
  );

  const [methods, setMethods] = useState<PaymentArrangementsDraft>(() =>
    normalizePaymentArrangementsDraft({
      methodCodes: data.acceptedPaymentMethods ?? [],
      otherLabel: data.paymentMethodOther ?? null,
      instructionTemplates: data.paymentInstructionTemplates ?? {},
      details: (data.paymentDetails ?? {}) as PaymentDetailsDraftMap,
    }),
  );
  const listingCurrency = depositPoliciesCurrency(data);
  const storedDeposits = depositAnswerFromDraft(data);
  const [deposits, setDeposits] = useState<DepositPoliciesDraft>(
    () => storedDeposits.draft,
  );
  const [cancellation, setCancellation] = useState<CancellationAnswer>(() =>
    cancellationAnswerFromDraft(data.freeCancellationDaysBeforeCheckIn),
  );

  /** Only after a blocked Continue. A screen that opens covered in red tells a host
   *  they got something wrong before anybody asked them anything. */
  const [showErrors, setShowErrors] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  /** Bumped whenever the summary should take the cursor. The summary does not exist
   *  in the DOM at the moment the handler decides that, so the move waits for the
   *  render that creates it. */
  const [summaryFocusToken, setSummaryFocusToken] = useState(0);

  const answer = { methods, deposits, currency: listingCurrency, cancellation };
  const issues = paymentTermsIssues(answer);
  const visibleIssues = showErrors ? issues : [];
  const showSummary = visibleIssues.length > 0 || saveFailed;

  useEffect(() => {
    if (summaryFocusToken === 0) return;
    const element = document.getElementById(SUMMARY_ID);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  }, [summaryFocusToken]);

  /** Names every problem, then sends the host to the first one. */
  function reportIssues(list: PaymentTermsIssue[]) {
    setShowErrors(true);
    setSaveFailed(false);
    const first = list[0];
    if (!first || typeof document === "undefined") return;
    goTo(first);
  }

  function goTo(issue: PaymentTermsIssue) {
    if (typeof document === "undefined") return;
    document
      .getElementById(issue.anchorId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    // `preventScroll`, so the smooth scroll above is the movement the host sees
    // rather than an instant jump that cancels it half way.
    document.getElementById(issue.focusId)?.focus?.({ preventScroll: true });
  }

  const methodCodes = normalizePaymentMethodCodes(methods.methodCodes);
  const cancellationDays = cancellationSummaryDays(cancellation);

  function setAdvanceEnabled(enabled: boolean) {
    setDeposits((current) => ({
      ...current,
      advancePayment: { ...current.advancePayment, enabled },
    }));
  }

  function setDamageEnabled(enabled: boolean) {
    setDeposits((current) => ({
      ...current,
      damageDeposit: { ...current.damageDeposit, enabled },
    }));
  }

  return (
    <>
      <main className="flex-1 px-5 pb-40 pt-4 md:px-8 md:pb-32">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-heading text-xl font-semibold text-slate-950 md:text-2xl">
            <Tx
              k="host.v2.payment.heading"
              source="How guests pay, and how they cancel"
            />
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <Tx
              k="host.v2.payment.intro"
              source="Only one answer is needed here: how guests can pay you. The rest is already set to the safest option, and you can change any of it."
            />
          </p>

          <TermsSummary
            methodCodes={methodCodes}
            otherLabel={methods.otherLabel}
            advanceRequired={deposits.advancePayment.enabled}
            damageRequired={deposits.damageDeposit.enabled}
            cancellationDays={cancellationDays}
          />

          {showSummary ? (
            <PaymentTermsErrorSummary
              issues={visibleIssues}
              saveFailed={saveFailed}
              onGoTo={goTo}
            />
          ) : null}
        </div>

        <section id={PAYMENT_METHODS_ANCHOR_ID} className="scroll-mt-6">
          <PaymentArrangementsEditor
            initialValue={{ ...methods, reviewedAt: null }}
            onSave={() => undefined}
            onChange={(next) => setMethods(next)}
            showSubmit={false}
            showHeader={false}
            showGuestPreview={false}
            showRequiredError={showErrors}
          />
        </section>

        <section
          id={DEPOSITS_ANCHOR_ID}
          aria-labelledby="payment-terms-deposits-heading"
          className="mx-auto w-full max-w-3xl scroll-mt-6 border-t border-slate-200 py-8"
        >
          <h2
            id="payment-terms-deposits-heading"
            className="text-base font-semibold text-slate-900"
          >
            <Tx
              k="host.editor.deposit.heading"
              source="Advance payment and damage deposit"
            />
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            <Tx
              k="host.v2.payment.deposits_intro"
              source="Most hosts ask for neither. Turn either of them on only if you want the money before or at the stay."
            />
          </p>

          {storedDeposits.currencyChanged ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {
                interpolate(
                  resolve(
                    "host.v2.payment.currency_changed",
                    "This listing now prices in {currency}. Check the amounts below before you continue.",
                  ),
                  { currency: listingCurrency },
                ).text
              }
            </p>
          ) : null}

          <DepositChoice
            name="advance-payment-choice"
            title={
              <Tx k="host.v2.payment.summary_advance" source="Advance payment" />
            }
            description={
              <Tx
                k="host.editor.deposit.advance.description"
                source="Part of the booking price, paid early. It counts toward what the guest owes for the stay — it is not a refundable damage deposit."
              />
            }
            enabled={deposits.advancePayment.enabled}
            onEnabledChange={setAdvanceEnabled}
            offLabel={<Tx k="host.v2.payment.not_required" source="Not required" />}
            offNote={
              <Tx
                k="host.v2.payment.advance_off_note"
                source="No advance payment required. Guests settle with you as you agree once you accept."
              />
            }
            onLabel={
              <Tx
                k="host.v2.payment.advance_on"
                source="Require advance payment"
              />
            }
            onNote={
              <Tx
                k="host.v2.payment.advance_on_note"
                source="Guests see the amount and when it is due before they send a request."
              />
            }
          >
            <DepositSectionFields
              idPrefix="advance-payment"
              listingCurrency={listingCurrency}
              section={deposits.advancePayment}
              onChange={(advancePayment) =>
                setDeposits((current) => ({ ...current, advancePayment }))
              }
            />
          </DepositChoice>

          <DepositChoice
            name="damage-deposit-choice"
            title={
              <Tx k="host.v2.payment.summary_damage" source="Damage deposit" />
            }
            description={
              <Tx
                k="host.editor.deposit.damage.description"
                source="Separate from the booking price. Security against damage that you give back to the guest afterwards."
              />
            }
            enabled={deposits.damageDeposit.enabled}
            onEnabledChange={setDamageEnabled}
            offLabel={<Tx k="host.v2.payment.not_required" source="Not required" />}
            offNote={
              <Tx
                k="host.v2.payment.damage_off_note"
                source="No damage deposit required. Guests owe nothing beyond the booking price."
              />
            }
            onLabel={
              <Tx k="host.v2.payment.damage_on" source="Require damage deposit" />
            }
            onNote={
              <Tx
                k="host.v2.payment.damage_on_note"
                source="Guests see the amount, when it is due, and when you give it back."
              />
            }
          >
            <DepositSectionFields
              idPrefix="damage-deposit"
              listingCurrency={listingCurrency}
              section={deposits.damageDeposit}
              onChange={(section) =>
                setDeposits((current) => ({
                  ...current,
                  damageDeposit: { ...current.damageDeposit, ...section },
                }))
              }
            >
              <ReturnDaysField
                value={deposits.damageDeposit.returnDaysAfterCheckout}
                onChange={(returnDaysAfterCheckout) =>
                  setDeposits((current) => ({
                    ...current,
                    damageDeposit: {
                      ...current.damageDeposit,
                      returnDaysAfterCheckout,
                    },
                  }))
                }
              />
            </DepositSectionFields>
          </DepositChoice>
        </section>

        <CancellationChoices
          id={CANCELLATION_ANCHOR_ID}
          answer={cancellation}
          onChange={setCancellation}
          invalid={visibleIssues.some(
            (issue) => issue.code === "CANCELLATION_INVALID",
          )}
        />
      </main>

      <ListingFlowFooter
        // The CTA keeps its handler whatever state the screen is in — a Next that
        // silently does nothing is indistinguishable from a broken one. It only stops
        // being a link while something is unfinished, so the press lands on the
        // handler that explains what.
        {...(issues.length === 0 ? { nextHref } : {})}
        onNext={async () => {
          if (issues.length > 0) {
            reportIssues(issues);
            return;
          }
          setShowErrors(false);
          setSaveFailed(false);
          if (
            await save({
              ...paymentTermsDraftPatch(answer),
              currentStepId: "specialOffer",
              currentRoute: nextRoute,
            })
          ) {
            window.location.assign(nextHref);
            return;
          }
          // Every answer stays exactly where it is: this state lives in the component,
          // and a failed PATCH never touched it.
          setSaveFailed(true);
          setSummaryFocusToken((token) => token + 1);
        }}
        backHref={returnToReview ? reviewHref(query) : `/host/start/price?${query}`}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={40}
        nextLabel={nextLabel}
      />
    </>
  );
}

/**
 * One alert for the whole screen.
 *
 * One, deliberately: a live region per broken field announces the same refusal four
 * times over and leaves a screen-reader user piecing the screen together from the
 * fragments. The inline messages beside the controls stay, as description rather than
 * as alerts, and this is the thing that speaks.
 */
export function PaymentTermsErrorSummary({
  issues,
  saveFailed,
  onGoTo,
}: {
  issues: PaymentTermsIssue[];
  saveFailed: boolean;
  onGoTo: (issue: PaymentTermsIssue) => void;
}) {
  return (
    <div
      id={SUMMARY_ID}
      tabIndex={-1}
      role="alert"
      className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        {saveFailed && issues.length === 0 ? (
          <Tx
            k="host.v2.payment.save_failed_heading"
            source="Your answers were not saved"
          />
        ) : (
          <Tx
            k="host.v2.payment.errors_heading"
            source="Finish this before you continue"
          />
        )}
      </h2>
      {saveFailed ? (
        <p className="mt-2 text-sm leading-6 text-rose-800">
          <Tx
            k="host.v2.payment.save_failed"
            source="Nothing you entered was lost. Check your connection and try again."
          />
        </p>
      ) : null}
      {issues.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {issues.map((issue) => (
            <li key={issue.code}>
              {/* A button rather than a bullet: the host is one press away from the
                  control that fixes it, from the keyboard as well as the pointer. */}
              <button
                type="button"
                onClick={() => onGoTo(issue)}
                className="text-left text-sm leading-6 text-rose-800 underline underline-offset-4 hover:text-rose-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <IssueMessage code={issue.code} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The four terms a guest ends up reading, restated at the top of the screen.
 *
 * Its whole job is to make the answers the host did not give as visible as the one they
 * did. It is derived from the same state the controls below are bound to, so it moves
 * the moment anything under it moves.
 */
function TermsSummary({
  methodCodes,
  otherLabel,
  advanceRequired,
  damageRequired,
  cancellationDays,
}: {
  methodCodes: PaymentMethodCode[];
  otherLabel: string | null;
  advanceRequired: boolean;
  damageRequired: boolean;
  cancellationDays: number | null;
}) {
  const { resolve } = useI18n();
  const methodNames = methodCodes
    .map((code) => paymentMethodName(code, otherLabel, resolve))
    .join(", ");

  return (
    <section
      aria-labelledby="payment-terms-summary-heading"
      className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
    >
      <h2
        id="payment-terms-summary-heading"
        className="flex items-center gap-2 text-sm font-semibold text-slate-900"
      >
        <BadgeCheck className="size-4 shrink-0 text-slate-500" aria-hidden />
        <Tx k="host.v2.payment.summary_heading" source="Your payment terms" />
      </h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <SummaryRow
          icon={<WalletCards className="size-4 shrink-0 text-slate-400" aria-hidden />}
          label={
            <Tx
              k="host.v2.payment.summary_methods"
              source="Accepted payment method"
            />
          }
          value={
            methodNames ? (
              <span translate="no">{methodNames}</span>
            ) : (
              <Tx k="host.v2.payment.summary_methods_empty" source="Not chosen yet" />
            )
          }
          muted={methodNames === ""}
        />
        <SummaryRow
          icon={<Coins className="size-4 shrink-0 text-slate-400" aria-hidden />}
          label={<Tx k="host.v2.payment.summary_advance" source="Advance payment" />}
          value={
            advanceRequired ? (
              <Tx k="host.v2.payment.required" source="Required" />
            ) : (
              <Tx k="host.v2.payment.not_required" source="Not required" />
            )
          }
        />
        <SummaryRow
          icon={<ShieldCheck className="size-4 shrink-0 text-slate-400" aria-hidden />}
          label={<Tx k="host.v2.payment.summary_damage" source="Damage deposit" />}
          value={
            damageRequired ? (
              <Tx k="host.v2.payment.required" source="Required" />
            ) : (
              <Tx k="host.v2.payment.not_required" source="Not required" />
            )
          }
        />
        <SummaryRow
          icon={<CalendarClock className="size-4 shrink-0 text-slate-400" aria-hidden />}
          label={
            <Tx
              k="host.v2.payment.summary_cancellation"
              source="Free cancellation deadline"
            />
          }
          value={<CancellationValue days={cancellationDays} />}
          muted={cancellationDays === null}
        />
      </dl>
    </section>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs leading-5 text-slate-500">{label}</dt>
        <dd
          className={cn(
            "text-sm font-medium leading-6",
            muted ? "text-slate-400" : "text-slate-900",
          )}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

/** The deadline in the words a guest would read it in. */
function CancellationValue({ days }: { days: number | null }) {
  const { resolve } = useI18n();
  if (days === null) {
    return <Tx k="host.v2.payment.cancellation_unset" source="Not set" />;
  }
  if (days === 0) {
    return (
      <Tx k="host.v2.payment.until_check_in" source="Until check-in begins" />
    );
  }
  return (
    <>
      {
        interpolate(
          resolve(
            "host.v2.payment.days_before",
            "{days} days before check-in",
          ),
          { days },
        ).text
      }
    </>
  );
}

/**
 * One deposit question as two explicit answers.
 *
 * A switch that starts off cannot say whether a host meant "no" or never looked, which
 * is why this screen used to need a separate "I ask for neither" tick box beneath the
 * pair of them. Two radios say it outright, in the host's own words, and the tick box
 * has nothing left to add.
 */
function DepositChoice({
  name,
  title,
  description,
  enabled,
  onEnabledChange,
  offLabel,
  offNote,
  onLabel,
  onNote,
  children,
}: {
  name: string;
  title: ReactNode;
  description: ReactNode;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  offLabel: ReactNode;
  offNote: ReactNode;
  onLabel: ReactNode;
  onNote: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset
      data-deposit-section={name}
      data-enabled={enabled}
      className="mt-4 rounded-xl border border-slate-200 p-4"
    >
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      <p className="text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          id={`${name}-off`}
          name={name}
          checked={!enabled}
          onSelect={() => onEnabledChange(false)}
          label={offLabel}
          note={offNote}
        />
        <ChoiceCard
          id={`${name}-on`}
          name={name}
          checked={enabled}
          onSelect={() => onEnabledChange(true)}
          label={onLabel}
          note={onNote}
        />
      </div>
      {/* Amounts and timing exist only once the host has asked for them. An empty set
          of money fields under a "Not required" answer is four questions nobody was
          asked, and the screen would then have to explain why they are ignored. */}
      {enabled ? (
        <div className="mt-4 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
          {children}
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * One radio in a card.
 *
 * The whole card is the label, so the entire tile is a hit target — which matters far
 * more on a phone than the extra words it puts into the control's accessible name. The
 * consequence line is the point of the card, so having it read out with the option is
 * the right trade rather than a cost.
 */
function ChoiceCard({
  id,
  name,
  checked,
  onSelect,
  label,
  note,
  invalid = false,
}: {
  id: string;
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: ReactNode;
  note: ReactNode;
  invalid?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
        checked
          ? "border-slate-900 bg-white ring-1 ring-slate-900"
          : "border-slate-200 bg-white hover:bg-slate-50",
        invalid && !checked && "border-rose-300",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-600">{note}</span>
      </span>
    </label>
  );
}

function ReturnDaysField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="block text-sm font-medium text-slate-800">
      <Label htmlFor="damage-deposit-return-days" className="mb-1.5 block">
        <Tx
          k="host.editor.deposit.return_days"
          source="Return within days after checkout (optional)"
        />
      </Label>
      <Input
        id="damage-deposit-return-days"
        type="number"
        min="1"
        step="1"
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.currentTarget.value ? Number(event.currentTarget.value) : null,
          )
        }
        className="bg-white"
      />
    </div>
  );
}

/**
 * The free-cancellation deadline as four ready answers and an escape hatch.
 *
 * It was a bare number field, which is the one control that cannot tell a host what
 * their answer *means* — and where the most generous answer, `0`, looks exactly like a
 * field nobody filled in. Each card states the consequence in the words the guest is
 * shown, so choosing one is reading it.
 */
function CancellationChoices({
  id,
  answer,
  onChange,
  invalid,
}: {
  id: string;
  answer: CancellationAnswer;
  onChange: (answer: CancellationAnswer) => void;
  invalid: boolean;
}) {
  const { resolve } = useI18n();
  const errorId = `${CUSTOM_CANCELLATION_FIELD_ID}-error`;
  const hintId = `${CUSTOM_CANCELLATION_FIELD_ID}-hint`;

  function select(choice: CancellationChoice) {
    onChange({ ...answer, choice });
  }

  return (
    <section
      id={id}
      aria-labelledby="payment-terms-cancellation-heading"
      className="mx-auto w-full max-w-3xl scroll-mt-6 border-t border-slate-200 py-8"
    >
      <h2
        id="payment-terms-cancellation-heading"
        className="text-base font-semibold text-slate-900"
      >
        <Tx k="host.editor.cancellation.heading" source="Cancellation policy" />
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        <Tx
          k="host.v2.payment.cancellation_intro"
          source="Choose how late a guest can cancel and still get a full refund."
        />
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          id="cancellation-choice-0"
          name="free-cancellation"
          checked={answer.choice === "0"}
          onSelect={() => select("0")}
          label={
            <Tx k="host.v2.payment.until_check_in" source="Until check-in begins" />
          }
          note={
            <Tx
              k="host.v2.payment.cancel_zero_note"
              source="Guests can cancel for a full refund until check-in begins."
            />
          }
          invalid={invalid}
        />
        {FREE_CANCELLATION_PRESET_DAYS.filter((days) => days > 0).map((days) => (
          <ChoiceCard
            key={days}
            id={`cancellation-choice-${days}`}
            name="free-cancellation"
            checked={answer.choice === String(days)}
            onSelect={() => select(String(days) as CancellationChoice)}
            label={
              interpolate(
                resolve("host.v2.payment.days_before", "{days} days before check-in"),
                { days },
              ).text
            }
            note={
              interpolate(
                resolve(
                  "host.v2.payment.cancel_days_note",
                  "Guests can cancel for a full refund until {days} days before check-in.",
                ),
                { days },
              ).text
            }
            invalid={invalid}
          />
        ))}
        <ChoiceCard
          id="cancellation-choice-custom"
          name="free-cancellation"
          checked={answer.choice === "CUSTOM"}
          onSelect={() => select("CUSTOM")}
          label={<Tx k="host.v2.payment.cancel_custom" source="Another deadline" />}
          note={
            <Tx
              k="host.v2.payment.cancel_custom_note"
              source="Set your own number of days before check-in."
            />
          }
          invalid={invalid}
        />
      </div>

      {answer.choice === "CUSTOM" ? (
        <div className="mt-4 max-w-xs">
          <Label htmlFor={CUSTOM_CANCELLATION_FIELD_ID} className="mb-1.5 block">
            <Tx
              k="host.v2.payment.cancel_custom_label"
              source="Days before check-in"
            />
          </Label>
          <Input
            id={CUSTOM_CANCELLATION_FIELD_ID}
            type="number"
            min="0"
            max="3650"
            step="1"
            inputMode="numeric"
            value={answer.customDays}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : hintId}
            onChange={(event) =>
              onChange({ ...answer, customDays: event.currentTarget.value })
            }
          />
          {invalid ? (
            <p id={errorId} className="mt-2 text-sm leading-6 text-rose-700">
              <Tx
                k="host.v2.payment.cancel_custom_error"
                source="Enter a whole number of days from 0 to 3650."
              />
            </p>
          ) : (
            <p id={hintId} className="mt-2 text-xs leading-5 text-slate-500">
              <Tx
                k="host.v2.payment.cancel_custom_hint"
                source="A whole number from 0 to 3650."
              />
            </p>
          )}
        </div>
      ) : null}

      <p className="mt-4 text-sm leading-6 text-slate-500">
        <Tx
          k="host.editor.cancellation.after_deadline"
          source="After that deadline, you may keep only an advance payment already received. A damage deposit is always separate and refundable."
        />
      </p>
    </section>
  );
}

function IssueMessage({ code }: { code: PaymentTermsIssueCode }) {
  switch (code) {
    case "PAYMENT_METHOD_REQUIRED":
      return (
        <Tx
          k="host.editor.payment_arrangements.method_required"
          source="Choose at least one way guests can pay."
        />
      );
    case "OTHER_METHOD_LABEL":
      return (
        <Tx
          k="host.v2.payment.error_other_label"
          source="Give your other payment method a short public name."
        />
      );
    case "PAYMENT_DETAILS_INVALID":
      return (
        <Tx
          k="host.v2.payment.error_details"
          source="Check the payment details you entered, or clear them and add them later."
        />
      );
    case "ADVANCE_PAYMENT_INCOMPLETE":
      return (
        <Tx
          k="host.v2.payment.error_advance"
          source="Enter the advance payment amount and when it is due."
        />
      );
    case "DAMAGE_DEPOSIT_INCOMPLETE":
      return (
        <Tx
          k="host.v2.payment.error_damage"
          source="Enter the damage deposit amount and when it is due."
        />
      );
    case "CANCELLATION_INVALID":
      return (
        <Tx
          k="host.v2.payment.cancel_custom_error"
          source="Enter a whole number of days from 0 to 3650."
        />
      );
  }
}

/** Plain-text method name for the summary line. */
function paymentMethodName(
  code: PaymentMethodCode,
  otherLabel: string | null,
  resolve: ReturnType<typeof useI18n>["resolve"],
): string {
  switch (code) {
    case "CASH_AT_PROPERTY":
      return resolve("host.editor.payment_arrangements.cash", "Cash at the property")
        .text;
    case "BANK_TRANSFER_LOCAL_SEPA":
      return resolve(
        "host.editor.payment_arrangements.bank_local",
        "Bank transfer (local or Europe)",
      ).text;
    case "BANK_TRANSFER_INTERNATIONAL":
      return resolve(
        "host.editor.payment_arrangements.bank_international",
        "Bank transfer (other countries)",
      ).text;
    case "PAYPAL":
      return resolve("host.editor.payment_arrangements.paypal", "PayPal").text;
    case "REVOLUT":
      return resolve("host.editor.payment_arrangements.revolut", "Revolut").text;
    case "WISE":
      return resolve("host.editor.payment_arrangements.wise", "Wise").text;
    case "BITCOIN":
      return resolve("host.editor.payment_arrangements.bitcoin", "Bitcoin").text;
    case "HOST_SECURE_CARD_LINK":
      return resolve(
        "host.editor.payment_arrangements.secure_card_link",
        "Secure card payment link from host",
      ).text;
    case "OTHER":
      return (
        (otherLabel ?? "").trim() ||
        resolve("host.editor.payment_arrangements.other", "Another payment method")
          .text
      );
    case "ARRANGE_DIRECTLY":
      return resolve(
        "host.editor.payment_arrangements.arrange_directly",
        "Arrange directly after the booking request",
      ).text;
  }
}
