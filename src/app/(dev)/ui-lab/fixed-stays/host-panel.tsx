"use client";

import { useState } from "react";
import { ArrowLeft, CalendarCheck2, CalendarRange, X } from "lucide-react";
import {
  StepperColumn,
  SummaryRow,
  ToggleRow,
} from "@/components/host/v2/calendar/workbench-ui";
import {
  MIN_STAY_MAX,
  MIN_STAY_MIN,
  clampMinStay,
} from "@/lib/host/v2/listing-availability-step";
import { LAB_TODAY, LISTING, NIGHTLY_PRICING } from "./fixtures";
import { money } from "./display";
import { ChoiceCard } from "./surfaces";
import {
  FactRow,
  PanelBand,
  PanelSection,
  PrototypeNote,
} from "./panel-chrome";
import { FixedStaysEditor } from "./fixed-stay-editor";
import {
  LISTING_MENU,
  bookingMethodSummary,
  editorLabel,
  type BookingMode,
  type ListingEditor,
  type PanelView,
} from "./panel-view";
import {
  resolvePeriodsForHost,
  type CalendarBlock,
  type FixedStayPeriod,
} from "./periods";

/**
 * The host half of the mockup, inside the Calendar's editing panel.
 *
 * The earlier version of this file was a full-width editor page, on the argument that a
 * list of dates needs room. The product decided where this actually lives — Calendar →
 * pick a listing → the right-hand panel → Booking method — so the argument is settled
 * against it, and the shape here is the panel's: `ManageCalendarPanel`'s header, band,
 * `SummaryRow` menu and single scrolling body, restated rather than imported, because
 * importing the real panel would mean feeding it a `HostCalendarListing`, an index, a
 * selection and a review pipeline this prototype has no business owning.
 *
 * **One destination at a time.** The menu lists the four settings that belong to the
 * listing rather than to a run of nights; opening one replaces the menu, and Back is
 * the only way up. Only Booking method is built out — the other three state what they
 * hold and say plainly that this prototype does not edit them.
 *
 * Nothing here reads or writes anything real: no server action, no query, no route.
 */
export function HostPanel({
  view,
  onOpenEditor,
  onBack,
  onClose,
  mode,
  onModeChange,
  minNights,
  onMinNightsChange,
  periods,
  blocks,
  onPeriodsChange,
}: {
  view: PanelView;
  onOpenEditor: (editor: ListingEditor) => void;
  onBack: () => void;
  /** Closes the compact-width sheet. Desktop has no sheet and hides the control. */
  onClose?: () => void;
  mode: BookingMode;
  onModeChange: (mode: BookingMode) => void;
  /**
   * Held by the lab rather than by this component, so it survives both the switch to
   * fixed stays and the trip back out to the menu — the number a host set is theirs
   * until they change it, not something a screen throws away when it unmounts.
   */
  minNights: number;
  onMinNightsChange: (nights: number) => void;
  periods: FixedStayPeriod[];
  blocks: CalendarBlock[];
  onPeriodsChange: (periods: FixedStayPeriod[]) => void;
}) {
  // Listed or hidden is a real switch in the product; here it is only ever this
  // panel's own state, which is why it does not need lifting the way the minimum does.
  const [listed, setListed] = useState(true);

  const editor = view.kind === "editor" ? view.editor : null;
  const resolved = resolvePeriodsForHost(periods, blocks, LAB_TODAY);
  const offeredCount = resolved.filter(
    (period) => period.state !== "PAST" && period.state !== "DISABLED",
  ).length;
  const promotions = NIGHTLY_PRICING.promotions;

  /** The truthful one-line state behind each menu row. */
  function menuValue(candidate: ListingEditor): {
    text: string;
    empty?: boolean;
  } {
    switch (candidate) {
      case "visibility":
        // Hidden is a state the host chose, not a setting they have left blank, so it
        // keeps the pill. `emptyValue` is reserved for a value that names an absence.
        return { text: listed ? "Listed" : "Hidden" };
      case "booking-method":
        return { text: bookingMethodSummary(mode, offeredCount) };
      case "pricing":
        return {
          text: `${money(NIGHTLY_PRICING.baseNightlyRate)} · ${money(
            NIGHTLY_PRICING.cleaningFee,
          )} cleaning`,
        };
      case "promotions":
        return {
          text: `${promotions.length} ${promotions.length === 1 ? "promotion" : "promotions"}`,
          empty: promotions.length === 0,
        };
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The panel's own header: one statement of where you are, a way back, and — on a
          phone, where this is the sheet's header too — a way out. It stays put while
          the body below it scrolls. */}
      <header className="flex shrink-0 items-start gap-2 border-b border-slate-100 pb-3">
        {editor ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]"
            aria-label="Back"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 pt-1.5">
          <h2
            id="fixed-stays-panel-title"
            className="truncate text-[0.9375rem] font-semibold text-slate-900"
          >
            {editor ? editorLabel(editor) : LISTING.title}
          </h2>
          {/* On the menu that is the scope; on every screen below it the property,
              because the scope is stated on the band and the listing's name is the
              thing that would otherwise leave the screen. */}
          <p className="mt-0.5 min-w-0 truncate text-[0.75rem] text-slate-500">
            {editor ? LISTING.title : "All future dates"}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a] lg:hidden"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </header>

      {/* The only thing that scrolls. A long season is thirty rows, and they scroll
          here — never inside a box within this box. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        {editor === null ? (
          <div className="flex flex-col gap-1">
            <PanelBand
              title="What would you like to change?"
              hint="These settings apply to the whole listing. Select dates on the calendar to change particular nights."
            />
            <div className="flex flex-col gap-2">
              {LISTING_MENU.map((candidate) => {
                const value = menuValue(candidate);
                return (
                  <SummaryRow
                    key={candidate}
                    label={editorLabel(candidate)}
                    value={value.text}
                    emptyValue={value.empty}
                    onClick={() => onOpenEditor(candidate)}
                  />
                );
              })}
            </div>
          </div>
        ) : editor === "booking-method" ? (
          <BookingMethodEditor
            mode={mode}
            onModeChange={onModeChange}
            minNights={minNights}
            onMinNightsChange={onMinNightsChange}
            periods={periods}
            blocks={blocks}
            onPeriodsChange={onPeriodsChange}
          />
        ) : editor === "visibility" ? (
          <VisibilityEditor listed={listed} onListedChange={setListed} />
        ) : editor === "pricing" ? (
          <DefaultPricingEditor />
        ) : (
          <PromotionsEditor promotions={promotions} />
        )}
      </div>
    </div>
  );
}

/**
 * The one editor this prototype is about.
 *
 * The two answers are the same selection cards the approved mockup used, on the panel's
 * type scale and stacked rather than side by side. What follows them is one or the
 * other and never both: a listing that sells whole stays has no minimum stay to set,
 * because the stay lengths *are* the answer, and showing both would be offering a host
 * two rules that can contradict each other.
 */
function BookingMethodEditor({
  mode,
  onModeChange,
  minNights,
  onMinNightsChange,
  periods,
  blocks,
  onPeriodsChange,
}: {
  mode: BookingMode;
  onModeChange: (mode: BookingMode) => void;
  minNights: number;
  onMinNightsChange: (nights: number) => void;
  periods: FixedStayPeriod[];
  blocks: CalendarBlock[];
  onPeriodsChange: (periods: FixedStayPeriod[]) => void;
}) {
  return (
    <>
      <PanelBand
        title="How can guests book these dates?"
        hint="Applies to every future date on this listing."
      />
      <div className="flex flex-col gap-5 px-1">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">How can guests book these dates?</legend>
          <ChoiceCard
            name="fixedStaysBookingMode"
            value="flexible"
            checked={mode === "flexible"}
            onSelect={() => onModeChange("flexible")}
            icon={<CalendarRange className="size-4" strokeWidth={1.8} />}
            title="Flexible dates"
            hint="Guests choose their own check-in and checkout, within your minimum stay."
          />
          <ChoiceCard
            name="fixedStaysBookingMode"
            value="fixed"
            checked={mode === "fixed"}
            onSelect={() => onModeChange("fixed")}
            icon={<CalendarCheck2 className="size-4" strokeWidth={1.8} />}
            title="Fixed stays"
            hint="Guests can only book the exact stays you add. Nothing else on the calendar is bookable."
          />
        </fieldset>

        {mode === "flexible" ? (
          <MinimumStay value={minNights} onChange={onMinNightsChange} />
        ) : (
          <FixedStaysEditor
            periods={periods}
            blocks={blocks}
            onPeriodsChange={onPeriodsChange}
          />
        )}
      </div>
    </>
  );
}

/**
 * Unchanged: the same control, bounds and words a host meets in the listing editor's
 * Availability step today, down to the clamp. Choosing flexible dates changes nothing
 * for them.
 */
function MinimumStay({
  value,
  onChange,
}: {
  value: number;
  onChange: (nights: number) => void;
}) {
  return (
    <PanelSection id="fixed-stays-min-stay-heading" title="Minimum stay">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
        <p className="min-w-[9rem] flex-1 text-[0.75rem] leading-4 text-slate-500">
          Applies to every date. You can set different minimums per date on the
          calendar.
        </p>
        <StepperColumn
          label="Nights"
          caption={value <= MIN_STAY_MIN ? "any length" : "nights minimum"}
          value={value}
          min={MIN_STAY_MIN}
          max={MIN_STAY_MAX}
          decrementLabel="Fewer nights"
          incrementLabel="More nights"
          onChange={(next) => onChange(clampMinStay(next))}
        />
      </div>
    </PanelSection>
  );
}

/** Listed or hidden, on the product's own switch row. */
function VisibilityEditor({
  listed,
  onListedChange,
}: {
  listed: boolean;
  onListedChange: (listed: boolean) => void;
}) {
  return (
    <>
      <PanelBand
        title="Listing visibility"
        hint="Whether guests can find and open this listing at all."
      />
      <div className="flex flex-col gap-3 px-1">
        <ToggleRow
          checked={listed}
          label="Listed"
          description={
            listed
              ? "Guests can find this listing in search and open it."
              : "Hidden from search. Bookings a guest already holds are unaffected."
          }
          onChange={onListedChange}
        />
        <PrototypeNote>
          Shown so the menu is the real menu. Changing it here changes nothing.
        </PrototypeNote>
      </div>
    </>
  );
}

/**
 * Base nightly price and cleaning fee, and nothing else.
 *
 * Stated rather than edited, in the shape the real panel reports a listing default.
 * These two numbers, the date prices on the calendar and whatever promotion applies are
 * the whole of what a fixed stay costs — there is no package price to set and none to
 * calculate, which is exactly why this row is worth showing beside Booking method.
 */
function DefaultPricingEditor() {
  return (
    <>
      <PanelBand
        title="Default pricing"
        hint="What every date starts from, before date prices and promotions."
      />
      <div className="flex flex-col gap-3 px-1">
        <dl className="flex flex-col gap-2">
          <FactRow
            label="Base price"
            value={`${money(NIGHTLY_PRICING.baseNightlyRate)} per night`}
          />
          <FactRow
            label="Cleaning fee"
            value={`${money(NIGHTLY_PRICING.cleaningFee)} per stay`}
          />
        </dl>
        <p className="text-[0.75rem] leading-4 text-slate-500">
          A fixed stay is priced from these, the date prices on the calendar and any
          promotion that applies — the same arithmetic as a flexible booking of the same
          nights. There is no separate price for a stay period.
        </p>
        <PrototypeNote>
          Shown so the menu is the real menu. Editing these is not part of this
          prototype.
        </PrototypeNote>
      </div>
    </>
  );
}

/** The listing's ongoing offers, as facts. They reach fixed stays and flexible dates
 *  alike, because a promotion is a rule about nights and money, not about booking mode. */
function PromotionsEditor({
  promotions,
}: {
  promotions: typeof NIGHTLY_PRICING.promotions;
}) {
  return (
    <>
      <PanelBand
        title="Promotions"
        hint="Offers that run on every date until you stop them."
      />
      <div className="flex flex-col gap-3 px-1">
        {promotions.length === 0 ? (
          <p className="text-[0.8125rem] leading-5 text-slate-500">
            No ongoing offers on this listing.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {promotions.map((promotion) => (
              <li key={promotion.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[0.8125rem] font-semibold text-slate-900">
                  {promotion.discountPercent}% off
                </p>
                <p className="mt-0.5 text-[0.75rem] leading-4 text-slate-500">
                  Stays of {promotion.minimumNights} nights or more
                  {promotion.freeCleaning ? ", cleaning fee waived" : ""}. Applies to
                  fixed stays and flexible dates alike.
                </p>
              </li>
            ))}
          </ul>
        )}
        <PrototypeNote>
          Shown so the menu is the real menu. Editing these is not part of this
          prototype.
        </PrototypeNote>
      </div>
    </>
  );
}
