"use client";

import { HelpCircle, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/currency/convert";
import { currencyDisplayName, currencySymbol } from "@/lib/currency/currencies";
import {
  CLEANING_FEE_MAX,
  EXAMPLE_STAY_NIGHTS,
  NIGHTLY_PRICE_MAX,
  NIGHTLY_PRICE_MIN,
  cleaningFeeIssue,
  exampleStayTotal,
  nightlyPriceIssue,
  parseNightlyPrice,
  sanitizeCleaningFeeInput,
  sanitizeNightlyPriceInput,
  type NightlyPriceIssue,
} from "@/lib/host/v2/listing-nightly-price";
import { Switch } from "@/components/ui/switch";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import {
  convertPriceStepAmounts,
  currencyAdjustedMaximum,
  draftCurrencyOffer,
} from "@/lib/host/v2/draft-currency";
import { ListingFlowFooter } from "./listing-flow-footer";
import { InfoSheet } from "./info-sheet";
import { useHostStartDraft } from "./host-start-draft-provider";

/**
 * Phase three, step one: what a stay costs.
 *
 * Two amounts, and one of them is optional, laid out as the same labelled rows the
 * basics step uses rather than as a hero number with steppers either side. Counts get
 * steppers in this flow; money gets typed, because nobody nudges from 120 to 145 five
 * units at a time.
 *
 * Both fields start empty. A seeded amount was the obvious kindness and the wrong one:
 * the ceilings here are currency-aware — see `currencyAdjustedMaximum` — but a seeded
 * number could not be, so a host pricing in MKD opened this screen on 50 ден, about
 * €0.80, and the floor of 1 waved it through. Converting the seed only trades a
 * misleading number for a precise-looking invented one. With no market data behind this
 * flow, empty is the only honest opening state, and it makes both amounts obey one rule:
 * every number stored here is one the host actually chose.
 *
 * The rules are the product's existing ones, not a second pricing model: the floor is
 * the pricing service's `min(1)`, whole currency units are the Calendar price editor's
 * rounding, and both amounts render through `formatMoney`, the same isomorphic formatter
 * every guest-facing price goes through. Only the two ceilings are new, and they are
 * documented as typo guards rather than as rules anything stored enforces.
 *
 * What the screen deliberately does *not* do is explain itself in prose. The example
 * stay line teaches the one thing a host has to understand — that the fee is charged
 * once and the rate is per night — by showing it, and everything else about how pricing
 * works lives behind one control, in a sheet.
 */
export function PriceStep({
  propertyType,
  spaceType,
  currency,
  displayCurrency = currency,
  rates = null,
  initialPrice = "",
  initialCleaningFee = "",
  initialFeeOn,
  initialTouched = false,
  initialInfoOpen = false,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** The fallback currency for a brand-new draft — what the host is paid in, never a
   *  converted display amount. A draft that already carries a currency (an imported
   *  listing, or a step the host has been through before) keeps its own. */
  currency: string;
  /** What the host is currently reading prices in. Only ever compared against the
   *  draft's own currency to decide whether to *offer* a change; it never becomes the
   *  listing's currency on its own. */
  displayCurrency?: string;
  /** Base-quoted multipliers, so a change of currency can move the amounts with the
   *  label. Null when the provider is down, which turns the offer into "clear and
   *  retype" rather than into a guess. */
  rates?: Readonly<Record<string, number>> | null;
  /** Test seam, and the reason every state of the field is reachable in a static
   *  render. The flow never arrives here with a price. */
  initialPrice?: string;
  /** Test seam: a fee here opens the screen with the toggle on and the row showing,
   *  which is otherwise only reachable by pressing the switch. */
  initialCleaningFee?: string;
  /** Test seam: the switch on with nothing in the field — the one state a host can
   *  only reach by pressing it, and the one the EMPTY error exists for. */
  initialFeeOn?: boolean;
  /** Test seam: renders the error state a host only reaches by trying to move on. */
  initialTouched?: boolean;
  /** Test seam: renders the explanation sheet, which is otherwise closed. */
  initialInfoOpen?: boolean;
}) {
  const { locale, resolve } = useI18n();
  const { data, save } = useHostStartDraft();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const [price, setPrice] = useState(() => sanitizeNightlyPriceInput(data.baseNightlyRate ?? initialPrice));
  const [cleaningFee, setCleaningFee] = useState(() =>
    sanitizeCleaningFeeInput(data.cleaningFee ?? initialCleaningFee),
  );
  /** Charging is the opt-in. A draft that already carries a fee opens with the switch
   *  on, so coming back to this step shows the host what they chose last time. */
  const [feeOn, setFeeOn] = useState(
    () =>
      initialFeeOn ??
      parseCleaningFeeValue(data.cleaningFee ?? initialCleaningFee) > 0,
  );
  /*
   * The listing's own currency. The draft's stored value wins over the flow's default:
   * an imported listing priced in USD stays in USD, and only a draft that has never
   * carried one falls back to what the host is browsing in.
   *
   * `chosenCurrency` is the one thing that can override it, and it is only ever set by
   * the host pressing a button in the notice below — together with the converted or
   * cleared amounts, in the same click. Nothing on this screen relabels an amount.
   */
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const storedCurrency = data.currency ?? currency;
  const draftCurrency = chosenCurrency ?? storedCurrency;
  const nightlyMaximum = currencyAdjustedMaximum(
    NIGHTLY_PRICE_MAX,
    draftCurrency,
    rates,
  );
  const cleaningFeeMaximum = currencyAdjustedMaximum(
    CLEANING_FEE_MAX,
    draftCurrency,
    rates,
  );
  /** Only offered against a currency the draft actually stored. A brand-new draft has
   *  no amounts to protect and is already seeded with the host's own currency. */
  const baseOffer =
    data.currency && !chosenCurrency
      ? draftCurrencyOffer(storedCurrency, displayCurrency, rates)
      : "none";
  const offeredConversion =
    baseOffer === "convert"
      ? convertPriceStepAmounts(
          { price, cleaningFee },
          storedCurrency,
          displayCurrency,
          rates,
        )
      : null;
  // A quoted rate is not enough if the converted result cannot be represented by the
  // fields. Offer the explicit clear path rather than a Convert button that does
  // nothing or, worse, clamps the value.
  const offer = baseOffer === "convert" && !offeredConversion ? "clear" : baseOffer;
  /** The errors appear once the host has tried to move on, not while they are midway
   *  through clearing a field to type a new amount. */
  const [touched, setTouched] = useState(initialTouched);
  const [infoOpen, setInfoOpen] = useState(initialInfoOpen);
  const priceRef = useRef<HTMLInputElement>(null);
  const cleaningFeeRef = useRef<HTMLInputElement>(null);
  const infoTriggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Where the cursor starts. On a pointer device the price field is focused and its
   * contents selected, so a host returning to a saved 120 types over it in one action.
   * On touch it is deliberately left alone: focusing on mount opens the keyboard across
   * the toggle, the example line and Next before the host has read the heading.
   */
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    priceRef.current?.focus();
    priceRef.current?.select();
  }, []);

  /** Switching the fee on hands the host the field it revealed. Only on the press —
   *  a draft that opens with the switch already on leaves focus where it was. */
  const feeJustOpened = useRef(false);
  useEffect(() => {
    if (!feeOn || !feeJustOpened.current) return;
    feeJustOpened.current = false;
    cleaningFeeRef.current?.focus();
  }, [feeOn]);

  /** Announced rather than only shown: the amounts change under the host's eyes, and a
   *  screen-reader user gets no other signal that they did. */
  const [currencyAnnouncement, setCurrencyAnnouncement] = useState("");
  /** The clear path asks twice. Conversion is reversible in effect — the money is
   *  still there in another currency — but clearing destroys what the host typed. */
  const [confirmClear, setConfirmClear] = useState(false);

  function convertToDisplayCurrency() {
    const next = offeredConversion;
    // Only reachable while the offer is "convert", so this is a guard, not a branch:
    // if the rate vanished between render and click, nothing changes at all.
    if (!next) return;
    setPrice(next.price);
    setCleaningFee(next.cleaningFee);
    setChosenCurrency(displayCurrency);
    setCurrencyAnnouncement(
      interpolate(
        resolve(
          "host.v2.price.currency_converted",
          "Your price is now {price} in {currency}.",
        ),
        {
          price: formatMoney(Number(next.price || 0), displayCurrency, locale),
          currency: displayCurrency,
        },
      ).text,
    );
    // Every branch here removes the notice, and with it the button that was focused.
    // Focus lands on the amount the host now has to check rather than on the document
    // root, which is where a keyboard user would otherwise be dropped.
    priceRef.current?.focus();
  }

  function clearAndSwitchCurrency() {
    setPrice("");
    setCleaningFee("");
    setChosenCurrency(displayCurrency);
    setConfirmClear(false);
    setTouched(false);
    setCurrencyAnnouncement(
      interpolate(
        resolve(
          "host.v2.price.currency_cleared",
          "Your price was cleared. Enter a new price in {currency}.",
        ),
        { currency: displayCurrency },
      ).text,
    );
    priceRef.current?.focus();
  }

  /** Dismisses the offer for this visit by pinning the draft's own currency. Nothing
   *  is written and nothing is converted — the listing simply stays as it is. */
  function keepDraftCurrency() {
    setChosenCurrency(storedCurrency);
    setConfirmClear(false);
    setCurrencyAnnouncement(
      interpolate(
        resolve(
          "host.v2.price.currency_kept",
          "This listing stays priced in {currency}.",
        ),
        { currency: storedCurrency },
      ).text,
    );
    priceRef.current?.focus();
  }

  const issue = nightlyPriceIssue(price, nightlyMaximum);
  /** A switch that is on and a field that is empty is not "no fee" — it is a host
   *  halfway through answering. Asked for rather than assumed, because a fee this
   *  screen invented would be charged on every booking without being noticed. */
  const feeIssue: CleaningFeeIssue | undefined = !feeOn
    ? undefined
    : parseCleaningFeeValue(cleaningFee) < 1
      ? "EMPTY"
      : cleaningFeeIssue(cleaningFee, cleaningFeeMaximum);
  const amount = parseNightlyPrice(price);
  const symbol = currencySymbol(draftCurrency, locale);
  const money = (value: number) => formatMoney(value, draftCurrency, locale);
  const message =
    touched && issue
      ? // The bounds are shown as money, not as bare numbers: "at least 1" reads as a
        // count of something, and the host is being told about a price.
        interpolate(issueTemplate(resolve, issue), {
          min: money(NIGHTLY_PRICE_MIN),
          max: money(nightlyMaximum),
        }).text
      : null;
  const feeMessage =
    touched && feeIssue
      ? feeIssue === "EMPTY"
        ? resolve(
            "host.v2.price.error_fee_empty",
            "Enter a cleaning fee, or turn it off.",
          ).text
        : interpolate(
            resolve("host.v2.price.error_fee_too_high", "Your cleaning fee can be at most {max}."),
            { max: money(cleaningFeeMaximum) },
          ).text
      : null;
  /** Held back until there is a price to demonstrate: "A 3-night stay costs €0.00" is
   *  not a lesson. It arrives as the reward for typing an amount. */
  const stayTotal =
    issue || feeIssue ? null : exampleStayTotal(price, feeOn ? cleaningFee : "");

  const blocked = Boolean(issue || feeIssue);
  // A real link on the happy path, so Next works before hydration; a button that only
  // surfaces the error while an amount is one the flow cannot accept.
  const nextAction = blocked
    ? {
        onNext: () => {
          setTouched(true);
          (issue ? priceRef : cleaningFeeRef).current?.focus();
        },
      }
    : {
        nextHref: `/host/start/payment-arrangements?${query}`,
        onNext: async () => {
          if (
            await save({
              baseNightlyRate: price,
              // Written on every pass, so switching the fee off is stored as "no cleaning
              // fee" rather than leaving a stale one on the draft.
              cleaningFee: String(feeOn ? parseCleaningFeeValue(cleaningFee) : 0),
              currency: draftCurrency,
              currentStepId: "specialOffer",
            })
          ) {
            window.location.assign(`/host/start/payment-arrangements?${query}`);
          }
        },
      };

  return (
    <>
      <main className="flex min-h-0 flex-1 px-5 pb-28 pt-6 md:px-8 md:pb-24 md:pt-2">
        {/* Auto block margins centre the form when space exists, but resolve to zero
            when it is taller than the viewport. Unlike `items-center`, that keeps the
            top reachable when the page has to scroll on a short laptop. */}
        <div className="mx-auto w-full max-w-[39rem] text-center md:my-auto">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
            <Tx k="host.v2.price.heading" source="Now, set your price" />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx k="host.v2.price.hint" source="You can change it anytime." />
          </p>

          {/*
           * Shown only when the listing's currency and the host's chosen display
           * currency have come apart — typically because they changed currency in the
           * regional-settings dialog partway through this flow.
           *
           * It offers; it never acts. The amounts on this screen keep their existing
           * currency until the host presses one of these buttons, and every button
           * moves the amount and the label together. There is deliberately no path
           * here that changes only the label.
           */}
          {offer !== "none" ? (
            <section
              aria-labelledby="listing-flow-currency-notice"
              className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-left"
            >
              <h2
                id="listing-flow-currency-notice"
                className="text-sm font-semibold text-amber-900"
              >
                {
                  interpolate(
                    resolve(
                      "host.v2.price.currency_mismatch_heading",
                      "This listing is priced in {listing}, but you are browsing in {display}.",
                    ),
                    { listing: storedCurrency, display: displayCurrency },
                  ).text
                }
              </h2>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                {offer === "convert" ? (
                  <Tx
                    k="host.v2.price.currency_mismatch_convert_hint"
                    source="Your listing keeps its own currency unless you change it here. Converting moves the amounts too — it never just renames them."
                  />
                ) : (
                  <Tx
                    k="host.v2.price.currency_mismatch_clear_hint"
                    source="These amounts cannot be converted safely into the selected currency. You can keep this listing's currency, or clear the amounts and enter them again."
                  />
                )}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {offer === "convert" ? (
                  <button
                    type="button"
                    onClick={convertToDisplayCurrency}
                    className="inline-flex min-h-9 items-center rounded-full bg-slate-900 px-4 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                  >
                    {
                      interpolate(
                        resolve(
                          "host.v2.price.currency_convert",
                          "Convert to {currency}",
                        ),
                        { currency: displayCurrency },
                      ).text
                    }
                  </button>
                ) : confirmClear ? (
                  <button
                    type="button"
                    onClick={clearAndSwitchCurrency}
                    className="inline-flex min-h-9 items-center rounded-full bg-rose-600 px-4 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                  >
                    <Tx
                      k="host.v2.price.currency_clear_confirm"
                      source="Yes, clear my price"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="inline-flex min-h-9 items-center rounded-full bg-slate-900 px-4 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                  >
                    {
                      interpolate(
                        resolve(
                          "host.v2.price.currency_clear",
                          "Clear and switch to {currency}",
                        ),
                        { currency: displayCurrency },
                      ).text
                    }
                  </button>
                )}
                <button
                  type="button"
                  onClick={keepDraftCurrency}
                  className="inline-flex min-h-9 items-center rounded-full border border-amber-300 px-4 text-[0.8125rem] font-semibold text-amber-900 transition-colors hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  {
                    interpolate(
                      resolve("host.v2.price.currency_keep", "Keep {currency}"),
                      { currency: storedCurrency },
                    ).text
                  }
                </button>
              </div>
            </section>
          ) : null}

          {/* Always mounted, so there is a region to announce into rather than one
              created at the moment it has something to say. */}
          <p role="status" aria-live="polite" className="sr-only">
            {currencyAnnouncement}
          </p>

          {/*
           * Two rows and a switch, at the size of an ordinary form. The nightly price
           * was a 4.5rem hero here, which made this the one screen in the flow speaking
           * its own visual language, and stacked badly on a phone once the fee sat
           * under it.
           */}
          <div className="mt-[clamp(1.5rem,4vh,2.5rem)] text-left">
            <FieldRow
              htmlFor="listing-flow-price"
              label={resolve("host.v2.price.per_night_label", "Price per night").text}
              note={
                resolve(
                  "host.form.pricing.nightly_hint",
                  "Your base price per night, before fees",
                ).text
              }
              errorId="listing-flow-price-error"
              error={message}
            >
              <MoneyInput
                id="listing-flow-price"
                inputRef={priceRef}
                symbol={symbol}
                value={price}
                invalid={Boolean(touched && issue)}
                describedBy="listing-flow-price-currency listing-flow-price-error"
                onChange={(next) => setPrice(sanitizeNightlyPriceInput(next))}
                onBlur={() => setTouched(true)}
              />
            </FieldRow>

            <FieldRow
              label={
                resolve(
                  "host.v2.price.charge_cleaning_fee",
                  "Charge a cleaning fee",
                ).text
              }
              note={
                resolve(
                  "host.v2.price.cleaning_fee_note",
                  "Charged once per stay, not per night.",
                ).text
              }
              labelFor="listing-flow-cleaning-fee-switch"
            >
              <Switch
                id="listing-flow-cleaning-fee-switch"
                aria-labelledby="listing-flow-cleaning-fee-switch-label"
                checked={feeOn}
                onCheckedChange={(next) => {
                  feeJustOpened.current = next;
                  setFeeOn(next);
                }}
              />
            </FieldRow>

            {/* Hidden rather than disabled while the fee is off: a greyed-out row with a
                number sitting in it is noise on a screen most hosts leave at two
                decisions. What was typed stays in state, so switching back on returns
                the amount rather than an empty field. */}
            {feeOn ? (
              <FieldRow
                htmlFor="listing-flow-cleaning-fee"
                label={
                  resolve("host.v2.price.cleaning_fee_label", "Cleaning fee").text
                }
                errorId="listing-flow-cleaning-fee-error"
                error={feeMessage}
              >
                <MoneyInput
                  id="listing-flow-cleaning-fee"
                  inputRef={cleaningFeeRef}
                  symbol={symbol}
                  value={cleaningFee}
                  invalid={Boolean(touched && feeIssue)}
                  describedBy="listing-flow-cleaning-fee-error"
                  onChange={(next) => setCleaningFee(sanitizeCleaningFeeInput(next))}
                  onBlur={() => setTouched(true)}
                />
              </FieldRow>
            ) : null}
          </div>

          {/* The line that does the teaching. It demonstrates per-night versus per-stay
              by arithmetic rather than by explaining it in a paragraph. */}
          {stayTotal !== null && amount !== null ? (
            <p className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-600">
              <Info className="size-4 shrink-0 text-slate-400" aria-hidden />
              {
                interpolate(
                  resolve(
                    "host.v2.price.stay_example",
                    "A {nights}-night stay costs {total}.",
                  ),
                  { nights: EXAMPLE_STAY_NIGHTS, total: money(stayTotal) },
                ).text
              }
            </p>
          ) : null}

          <button
            ref={infoTriggerRef}
            type="button"
            onClick={() => setInfoOpen(true)}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-700 underline underline-offset-4 transition-colors hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          >
            <HelpCircle className="size-4 shrink-0" aria-hidden />
            <Tx k="host.v2.price.how_pricing_works" source="How pricing works" />
          </button>

          <p
            id="listing-flow-price-currency"
            className="mt-4 text-sm text-slate-500"
            translate="no"
          >
            <Tx k="host.form.pricing.prices_in" source="Prices in" />{" "}
            {draftCurrency} · {currencyDisplayName(draftCurrency, locale)}
          </p>
        </div>
      </main>

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        returnFocusTo={infoTriggerRef}
        title={resolve("host.v2.price.how_pricing_works", "How pricing works").text}
      >
        <p>
          <Tx
            k="host.v2.price.info_base"
            source="This is your base price — what guests pay on any night you haven't given a price of its own."
          />
        </p>
        <p>
          <Tx
            k="host.v2.price.info_calendar"
            source="Once your listing is live, your calendar is where the rest happens: set prices for specific dates or seasons, block the nights you need, and add weekly, monthly or last-minute discounts."
          />
        </p>
        <p>
          <Tx
            k="host.v2.price.info_fee"
            source="A cleaning fee is added once to every booking, however long the stay. Switch it off if you don't charge one."
          />
        </p>
      </InfoSheet>

      <ListingFlowFooter
        backHref={`/host/start/phase-two-complete?${query}`}
        {...nextAction}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={20}
        nextLabel="Next"
      />
    </>
  );
}

/** What can be wrong with the fee. `EMPTY` is this screen's own: the shared validator
 *  only guards the ceiling, because everywhere else an empty fee means "none". */
type CleaningFeeIssue = "EMPTY" | "TOO_HIGH";

/**
 * One labelled row: what it is on the left, the control on the right, a hairline under
 * it, and a place for the error to land without the row moving.
 */
function FieldRow({
  htmlFor,
  labelFor,
  label,
  note,
  errorId,
  error,
  children,
}: {
  /** Set when the control is an input, so the whole label is a target for it. */
  htmlFor?: string;
  /** Set when the control is not an input — a switch is labelled, never `for`-ed into
   *  a caret. */
  labelFor?: string;
  label: string;
  note?: string;
  errorId?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="border-b border-slate-200 py-4">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="min-w-0">
          <Label
            {...(htmlFor ? { htmlFor } : {})}
            {...(labelFor ? { id: `${labelFor}-label` } : {})}
            className={cn(
              "block text-base font-medium text-slate-900",
              htmlFor ? "cursor-pointer" : undefined,
            )}
          >
            {label}
          </Label>
          {note ? (
            <p className="mt-0.5 text-sm leading-5 text-slate-500">{note}</p>
          ) : null}
        </div>
        {children}
      </div>
      {/* Always in the tree while the row is, so the live region exists to announce
          into rather than being created at the moment it has something to say. */}
      {errorId ? (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-sm text-rose-600 empty:hidden"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * An amount, as a currency symbol and a ruled field.
 *
 * The field selects its contents when it takes focus, so a host who means to overwrite
 * 120 does it by typing. That needs the mousedown as well as the focus: a click focuses
 * first and then collapses the selection on mouseup, so selecting in `onFocus` alone
 * never survives a mouse. A click *inside* an already-focused field is left to the
 * browser — that is a host placing a caret to edit, not to replace.
 */
function MoneyInput({
  id,
  inputRef,
  symbol,
  value,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: {
  id: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  symbol: string;
  value: string;
  invalid: boolean;
  describedBy: string;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 shrink-0 cursor-text items-center gap-1.5"
    >
      <span
        aria-hidden
        translate="no"
        className="font-heading text-xl font-medium text-slate-500"
      >
        {symbol}
      </span>
      <input
        id={id}
        ref={inputRef}
        // The host's own amount: the page-level Google translation is a reading aid and
        // must never rewrite a number the host is typing.
        className={cn(
          "notranslate max-w-[9ch] appearance-none border-0 border-b-2 bg-transparent pb-1",
          "text-right font-heading text-[1.75rem] font-semibold leading-none tabular-nums text-slate-950",
          "outline-none transition-colors duration-150 motion-reduce:transition-none",
          "placeholder:font-normal placeholder:text-slate-300",
          invalid
            ? "border-rose-400 focus:border-rose-500"
            : "border-slate-300 focus:border-slate-900",
        )}
        translate="no"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder="0"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        // Grows with the amount rather than sitting in a fixed box, with a floor wide
        // enough that an empty field still reads as a field and not as a stray rule.
        style={{ width: `${Math.max(value.length, 4)}ch` }}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onMouseDown={(event) => {
          if (event.currentTarget === document.activeElement) return;
          event.preventDefault();
          event.currentTarget.focus();
        }}
        onBlur={onBlur}
      />
    </label>
  );
}

/** The stored fee, as a number. Kept beside the component so the save reads the same
 *  value the example line was priced from. */
function parseCleaningFeeValue(raw: string): number {
  const digits = sanitizeCleaningFeeInput(raw);
  return digits === "" ? 0 : Number.parseInt(digits, 10);
}

function issueTemplate(
  resolve: (key: string, source: string) => { text: string; translated: boolean },
  issue: NightlyPriceIssue,
) {
  switch (issue) {
    case "EMPTY":
      return resolve("host.v2.price.error_empty", "Guests need a nightly price to book.");
    case "TOO_LOW":
      return resolve("host.v2.price.error_too_low", "Your price must be at least {min}.");
    case "TOO_HIGH":
      return resolve("host.v2.price.error_too_high", "Your price can be at most {max}.");
  }
}
