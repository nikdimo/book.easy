"use client";

import {
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CigaretteOff,
  ClipboardList,
  Info,
  Minus,
  PartyPopper,
  PawPrint,
  Plus,
  Trash2,
  Users,
  VolumeX,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { StepperButton } from "@/components/host/v2/stepper-button";
import { InfoSheet } from "@/components/host/v2/listings/info-sheet";
import { SHEET_PRIMARY_BUTTON, SheetPanel } from "@/components/host/v2/sheet-panel";
import {
  CHECK_IN_QUICK_TIMES,
  CHECK_OUT_QUICK_TIMES,
  TimePickerField,
} from "@/components/shared/time-picker-field";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import {
  ADDITIONAL_RULES_MAX,
  FLEXIBLE_STAY_TIME,
  MAX_GUESTS_MAX,
  MAX_GUESTS_MIN,
  QUIET_HOURS_PERIODS_MAX,
  houseRuleRowId,
  normalizeQuietHoursPeriods,
  quietHoursPeriodIssues,
  stayTimeChoices,
  type EventPolicy,
  type ListingHouseRulesInput,
  type ListingHouseRulesIssues,
  type PetPolicy,
  type QuietHoursPeriod,
  type QuietHoursPeriodIssue,
  type QuietHoursPolicy,
  type SmokingPolicy,
} from "@/lib/host/v2/listing-house-rules";
import {
  eventPolicyChoices,
  eventPolicyLabel,
  flexibleTimeLabel,
  houseRulesRowTitles,
  houseRulesSectionTitles,
  petPolicyChoices,
  petPolicyLabel,
  quietHoursChoices,
  quietHoursNoneLabel,
  quietHoursPeriodError,
  quietHoursPeriodsLabel,
  requiredBadgeLabel,
  smokingPolicyChoices,
  smokingPolicyLabel,
  unansweredActionLabel,
  unansweredLabel,
  type RuleChoice,
} from "@/lib/i18n/house-rules-labels";

/**
 * The House rules screen, in the one form both places that edit it use.
 *
 * The create flow and the post-publish editor render this component and nothing else:
 * the rows, the sheets they open, the wording and the per-row validation are the same
 * objects in both, so the two screens cannot disagree about what a rule is or which
 * answers are allowed. What differs between them is what happens to a change — the flow
 * saves to a draft when the host presses Next, the editor autosaves — and that stays
 * with the caller, which is the only thing about the two that genuinely is different.
 *
 * Rows rather than a page of controls. Eight rules laid out as selects and radio groups
 * is a wall of chrome to read past when a host has come to change one of them; a row
 * that states its current answer is scannable, and the answer is the thing they came to
 * check. Each row opens a sheet, which is also what makes the same layout work on a
 * phone, where the editor has no room for a second column.
 *
 * Nothing here is a source of truth. It renders `rules`, and every change goes back out
 * through `onChange` — the caller owns the state, the persistence and the recovery from a
 * refused write.
 */
export function HouseRulesRows({
  rules,
  onChange,
  issues,
  showIssues = true,
  idPrefix,
  requireAnswers = false,
  arrivalHeader,
  arrivalRows,
  showHeading = true,
  rulesHeader,
  guestFooter,
}: {
  rules: ListingHouseRulesInput;
  /**
   * A changed rule set.
   *
   * `immediate` distinguishes a decision from a nudge: a choice taken in a sheet is
   * final the moment it is made, while the guest stepper is one of twenty taps a host
   * may make in a row. The editor uses it to skip its debounce; the flow ignores it.
   */
  onChange: (next: ListingHouseRulesInput, immediate: boolean) => void;
  issues: ListingHouseRulesIssues;
  /** False while the host has not tried to leave the screen yet, so the flow does not
   *  open onto four red rows for questions it has not asked. */
  showIssues?: boolean;
  /** Distinguishes DOM ids when both screens exist in one test file, and keeps the
   *  editor's ids stable for anything that targets them. */
  idPrefix: string;
  /**
   * Whether the four policies are being *asked* on this screen.
   *
   * True in the create flow, and it changes three things: each policy row is marked
   * Required, an unanswered one reads as something to do rather than as a blank, and
   * the row errors stop being live regions — the flow raises one summary for the whole
   * screen, and four alerts firing at once leave a screen-reader user assembling the
   * page from fragments.
   *
   * False in the post-publish editor, where a listing published before these columns
   * existed has never been asked and must not be held hostage over it.
   */
  requireAnswers?: boolean;
  /** Rendered above the arrival rows. The flow says here that these three already
   *  carry usable values, so a host knows they are looking at defaults, not blanks. */
  arrivalHeader?: React.ReactNode;
  /**
   * Replaces the two stay-time rows entirely.
   *
   * The Arrival guide passes a single row here that links to its own check-in card,
   * because that card already edits these times a few centimetres up the same screen. Two
   * editors for one setting on one screen is not a convenience — it is a question about
   * which one is authoritative that the host should never have to ask. Everywhere else
   * these rows are the only editor there is, so they stay.
   */
  arrivalRows?: React.ReactNode;
  /**
   * Whether to draw the "House rules" title and its intro.
   *
   * False where the surrounding pane already carries a heading of its own. Two `<h1>`s
   * saying "House rules" one above the other is what the Arrival guide had before this
   * existed.
   */
  showHeading?: boolean;
  /** Rendered above the four policy rows. The flow puts its progress line and its one
   *  error summary here, which is where a host is looking when they are stuck. */
  rulesHeader?: React.ReactNode;
  /** Shown under the guest stepper. The editor puts its booked-party warning here; the
   *  flow has no bookings to warn about. */
  guestFooter?: React.ReactNode;
}) {
  const i18n = useI18n();
  const titles = houseRulesRowTitles(i18n);
  const sections = houseRulesSectionTitles(i18n);
  // "Not set" states a fact; "Choose an answer" states a task. Where the screen is
  // going to refuse to move on, the row should say which one it is.
  const unanswered = requireAnswers
    ? unansweredActionLabel(i18n)
    : unansweredLabel(i18n);
  const flexible = flexibleTimeLabel(i18n);
  const requiredBadge = requireAnswers ? requiredBadgeLabel(i18n) : undefined;

  const set = (patch: Partial<ListingHouseRulesInput>, immediate = true) =>
    onChange({ ...rules, ...patch }, immediate);

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoTrigger = useRef<HTMLButtonElement>(null);
  const close = () => setOpenRow(null);

  return (
    <div>
      <div className={cn("flex items-start justify-between gap-4", !showHeading && "sr-only")}>
        <div className="min-w-0">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
            <Tx k="listing.house_rules.heading" source="House rules" />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx
              k="listing.house_rules.intro"
              source="Set expectations for guests staying at your place."
            />
          </p>
        </div>
        <button
          ref={infoTrigger}
          type="button"
          onClick={() => setInfoOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-slate-700 underline-offset-4 transition-colors hover:text-slate-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          <Info className="size-4 shrink-0" aria-hidden />
          <Tx k="listing.house_rules.more_info" source="More info" />
        </button>
      </div>

      <RuleSection title={sections.arrival} id={`${idPrefix}-arrival`} header={arrivalHeader}>
        {arrivalRows ?? (
          <>
            <RuleRow
              announce={!requireAnswers}
              id={houseRuleRowId(idPrefix, "checkInTime")}
              icon={CalendarCheck}
              title={titles.checkIn}
              value={rules.checkInTime === FLEXIBLE_STAY_TIME ? flexible : rules.checkInTime}
              error={showIssues && issues.checkInTime ? stayTimeError(i18n) : null}
              onOpen={() => setOpenRow("check-in")}
            />
            <RuleRow
              announce={!requireAnswers}
              id={houseRuleRowId(idPrefix, "checkOutTime")}
              icon={CalendarClock}
              title={titles.checkOut}
              value={
                rules.checkOutTime === FLEXIBLE_STAY_TIME ? flexible : rules.checkOutTime
              }
              error={showIssues && issues.checkOutTime ? stayTimeError(i18n) : null}
              onOpen={() => setOpenRow("check-out")}
            />
          </>
        )}
      </RuleSection>

      <RuleSection title={sections.guests} id={`${idPrefix}-guests`}>
        {/* `tabIndex={-1}`: the guest limit is a pair of buttons rather than one
            control, so the row itself is what a summary sends the cursor to. */}
        <div
          id={houseRuleRowId(idPrefix, "maxGuests")}
          tabIndex={-1}
          className="flex items-center justify-between gap-4 py-3.5 outline-none"
        >
          <span className="flex min-w-0 items-center gap-3">
            <Users className="size-[1.15rem] shrink-0 text-slate-400" aria-hidden />
            <span className="truncate text-sm font-medium text-slate-900">
              {titles.maxGuests}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <StepperButton
              label={
                i18n.resolve(
                  "host.editor.house_rules.max_guests_decrease",
                  "One guest fewer",
                ).text
              }
              disabled={rules.maxGuests <= MAX_GUESTS_MIN}
              onClick={() =>
                set({ maxGuests: Math.max(MAX_GUESTS_MIN, rules.maxGuests - 1) }, false)
              }
            >
              <Minus className="size-4" aria-hidden />
            </StepperButton>
            <span
              className="min-w-6 text-center text-base font-medium tabular-nums text-slate-900"
              translate="no"
            >
              {rules.maxGuests}
            </span>
            <StepperButton
              label={
                i18n.resolve(
                  "host.editor.house_rules.max_guests_increase",
                  "One guest more",
                ).text
              }
              disabled={rules.maxGuests >= MAX_GUESTS_MAX}
              onClick={() =>
                set({ maxGuests: Math.min(MAX_GUESTS_MAX, rules.maxGuests + 1) }, false)
              }
            >
              <Plus className="size-4" aria-hidden />
            </StepperButton>
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {
            i18n.plural(
              "host.editor.house_rules.guest_limit_announcement",
              rules.maxGuests,
              "Maximum {n} guest",
              "Maximum {n} guests",
            ).text
          }
        </p>
        {guestFooter}
      </RuleSection>

      <RuleSection title={sections.rules} id={`${idPrefix}-policies`} header={rulesHeader}>
        <RuleRow
          required={requiredBadge}
          announce={!requireAnswers}
          id={houseRuleRowId(idPrefix, "petPolicy")}
          icon={PawPrint}
          title={titles.pets}
          value={rules.petPolicy ? petPolicyLabel(i18n, rules.petPolicy) : unanswered}
          unanswered={rules.petPolicy === null}
          error={showIssues && issues.petPolicy ? requiredError(i18n) : null}
          onOpen={() => setOpenRow("pets")}
        />
        <RuleRow
          required={requiredBadge}
          announce={!requireAnswers}
          id={houseRuleRowId(idPrefix, "smokingPolicy")}
          icon={CigaretteOff}
          title={titles.smoking}
          value={
            rules.smokingPolicy
              ? smokingPolicyLabel(i18n, rules.smokingPolicy)
              : unanswered
          }
          unanswered={rules.smokingPolicy === null}
          error={showIssues && issues.smokingPolicy ? requiredError(i18n) : null}
          onOpen={() => setOpenRow("smoking")}
        />
        <RuleRow
          required={requiredBadge}
          announce={!requireAnswers}
          id={houseRuleRowId(idPrefix, "eventPolicy")}
          icon={PartyPopper}
          title={titles.events}
          value={
            rules.eventPolicy ? eventPolicyLabel(i18n, rules.eventPolicy) : unanswered
          }
          unanswered={rules.eventPolicy === null}
          error={showIssues && issues.eventPolicy ? requiredError(i18n) : null}
          onOpen={() => setOpenRow("events")}
        />
        <RuleRow
          required={requiredBadge}
          announce={!requireAnswers}
          id={houseRuleRowId(idPrefix, "quietHoursPolicy")}
          icon={VolumeX}
          title={titles.quietHours}
          value={quietHoursValue(i18n, rules, unanswered)}
          unanswered={rules.quietHoursPolicy === null}
          error={
            showIssues
              ? issues.quietHoursPolicy
                ? requiredError(i18n)
                : issues.quietHoursStart || issues.quietHoursEnd
                  ? quietHoursError(i18n)
                  : // A collision or a duplicate lower down the list. Named on the row
                    // too, not only inside the sheet, because the row is what a host is
                    // sent to from the error summary and it has to say why.
                    issues.quietHoursPeriods
                    ? quietHoursPeriodError(
                        i18n,
                        issues.quietHoursPeriods,
                        QUIET_HOURS_PERIODS_MAX,
                      )
                    : null
              : null
          }
          onOpen={() => setOpenRow("quiet-hours")}
        />
      </RuleSection>

      <RuleSection title={sections.additional} id={`${idPrefix}-additional`}>
        <RuleRow
          announce={!requireAnswers}
          optional={
            requireAnswers
              ? i18n.resolve("listing.house_rules.optional", "Optional").text
              : undefined
          }
          id={houseRuleRowId(idPrefix, "additionalRules")}
          icon={ClipboardList}
          title={titles.additionalRules}
          subtitle={
            rules.additionalRules === ""
              ? i18n.resolve(
                  "listing.house_rules.additional_rules_empty",
                  "Add any other rules guests should know",
                ).text
              : rules.additionalRules
          }
          error={showIssues && issues.additionalRules ? additionalRulesError(i18n) : null}
          onOpen={() => setOpenRow("additional-rules")}
        />
      </RuleSection>

      <StayTimeSheet
        open={openRow === "check-in"}
        onClose={close}
        title={titles.checkIn}
        stored={rules.checkInTime}
        value={rules.checkInTime}
        quickTimes={CHECK_IN_QUICK_TIMES}
        onSelect={(checkInTime) => {
          set({ checkInTime });
          close();
        }}
      />
      <StayTimeSheet
        open={openRow === "check-out"}
        onClose={close}
        title={titles.checkOut}
        stored={rules.checkOutTime}
        value={rules.checkOutTime}
        quickTimes={CHECK_OUT_QUICK_TIMES}
        onSelect={(checkOutTime) => {
          set({ checkOutTime });
          close();
        }}
      />
      <ChoiceSheet<PetPolicy>
        open={openRow === "pets"}
        onClose={close}
        title={titles.pets}
        choices={petPolicyChoices(i18n)}
        value={rules.petPolicy}
        onSelect={(petPolicy) => {
          set({ petPolicy });
          close();
        }}
      />
      <ChoiceSheet<SmokingPolicy>
        open={openRow === "smoking"}
        onClose={close}
        title={titles.smoking}
        choices={smokingPolicyChoices(i18n)}
        value={rules.smokingPolicy}
        onSelect={(smokingPolicy) => {
          set({ smokingPolicy });
          close();
        }}
      />
      <ChoiceSheet<EventPolicy>
        open={openRow === "events"}
        onClose={close}
        title={titles.events}
        choices={eventPolicyChoices(i18n)}
        value={rules.eventPolicy}
        onSelect={(eventPolicy) => {
          set({ eventPolicy });
          close();
        }}
      />
      <QuietHoursSheet
        open={openRow === "quiet-hours"}
        onClose={close}
        title={titles.quietHours}
        idPrefix={idPrefix}
        rules={rules}
        onApply={(patch) => {
          set(patch);
          close();
        }}
      />
      <AdditionalRulesSheet
        open={openRow === "additional-rules"}
        onClose={close}
        title={titles.additionalRules}
        idPrefix={idPrefix}
        value={rules.additionalRules}
        onApply={(additionalRules) => {
          set({ additionalRules });
          close();
        }}
      />

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        returnFocusTo={infoTrigger}
        title={
          i18n.resolve("listing.house_rules.info_title", "About house rules").text
        }
      >
        <p>
          <Tx
            k="listing.house_rules.info_expectations"
            source="These rules help guests know what to expect before they book."
          />
        </p>
        <p>
          <Tx
            k="listing.house_rules.info_agreement"
            source="Guests must agree to them at the time of booking, and what they agreed to is kept with their reservation."
          />
        </p>
        <p>
          <Tx
            k="listing.house_rules.info_editable"
            source="You can update your house rules anytime. Changes apply to new bookings, never to stays a guest has already booked."
          />
        </p>
      </InfoSheet>
    </div>
  );
}

// ─── Row and section chrome ──────────────────────────────────────────────────────

function RuleSection({
  id,
  title,
  header,
  children,
}: {
  id: string;
  title: string;
  /** Sits between the section heading and its rows — a note, a progress line, or the
   *  screen's error summary, depending on which screen is rendering. */
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first-of-type:mt-7" aria-labelledby={id}>
      <h2
        id={id}
        className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500"
      >
        {title}
      </h2>
      {header}
      <div className="mt-1 divide-y divide-slate-100">{children}</div>
    </section>
  );
}

/**
 * One rule.
 *
 * A real `<button>` spanning the row, not a div with a click handler: the whole row is
 * the target on a phone, and the keyboard gets it for free. The chevron is decorative —
 * the accessible name is the rule and its current answer, which is what a screen-reader
 * user needs to decide whether to open it at all.
 */
function RuleRow({
  id,
  icon: Icon,
  title,
  value,
  subtitle,
  unanswered = false,
  required,
  optional,
  announce = true,
  error,
  onOpen,
}: {
  id: string;
  icon: typeof PawPrint;
  title: string;
  value?: string;
  subtitle?: string;
  unanswered?: boolean;
  /** "Required", when the screen is asking. A word, not a colour: the mark has to
   *  survive a greyscale screenshot and a screen reader alike. */
  required?: string;
  /** The counterpart, for the one row that genuinely is not required. */
  optional?: string;
  /** Whether this row's own error announces itself. False on a screen that raises one
   *  summary for all of them; see `requireAnswers`. */
  announce?: boolean;
  error?: string | null;
  onOpen: () => void;
}) {
  return (
    <div>
      <button
        id={id}
        type="button"
        onClick={onOpen}
        // No `aria-invalid`: the implicit button role does not support it, and a screen
        // reader would ignore it. `aria-describedby` reads the error out as part of the
        // row's description instead, which is also what a summary elsewhere on the page
        // relies on once the row itself has stopped announcing.
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "flex w-full items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
          // The invalid state is a rule, an icon and a word as well as a colour, so it
          // reads the same to anyone who cannot tell rose from slate.
          error && "border-l-2 border-rose-500 pl-3",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Icon
            className={cn(
              "size-[1.15rem] shrink-0",
              error ? "text-rose-500" : "text-slate-400",
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-slate-900">
                {title}
              </span>
              {required ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-slate-600">
                  {required}
                </span>
              ) : null}
              {optional ? (
                <span className="shrink-0 text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-slate-400">
                  {optional}
                </span>
              ) : null}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-xs leading-5 text-slate-500">
                {subtitle}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {value ? (
            <span
              className={cn(
                "text-sm",
                error
                  ? "font-medium text-rose-600"
                  : unanswered
                    ? "text-slate-500"
                    : "text-slate-600",
              )}
            >
              {value}
            </span>
          ) : null}
          <ChevronRight className="size-4 text-slate-400" aria-hidden />
        </span>
      </button>
      {error ? (
        <p
          id={`${id}-error`}
          {...(announce ? { role: "alert", "aria-live": "polite" as const } : {})}
          className="pb-3 text-sm text-rose-600"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ─── Sheets ──────────────────────────────────────────────────────────────────────

/**
 * A closed set of answers.
 *
 * Choosing commits and closes, with no confirm step: there is exactly one decision in
 * the sheet, and a "Done" the host must press after making it is a second tap that can
 * only be forgotten. A radio group rather than buttons, because that is what this is —
 * one answer out of several, and assistive technology should say so.
 */
function ChoiceSheet<T extends string>({
  open,
  onClose,
  title,
  choices,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  choices: RuleChoice<T>[];
  value: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <SheetPanel open={open} onClose={onClose} title={title}>
      <div role="radiogroup" aria-label={title} className="space-y-2">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={value === choice.value}
            onClick={() => onSelect(choice.value)}
            className={cn(
              "flex w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
              value === choice.value
                ? "border-slate-900 bg-slate-50"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <span className="text-sm font-semibold text-slate-900">{choice.label}</span>
            <span className="text-sm leading-6 text-slate-600">
              {choice.description}
            </span>
          </button>
        ))}
      </div>
    </SheetPanel>
  );
}

/**
 * One stay time.
 *
 * `TimePickerField` inline inside the sheet — the sheet is already the overlay, so the
 * picker renders in place rather than opening a popover on top of a modal. It replaced a
 * native `<select>`, which on desktop is a forty-nine row OS scroll list with no way to
 * say which handful of times a host almost always means.
 *
 * `stayTimeChoices` keeps an off-grid stored time (an imported "14:15") selectable rather
 * than silently rounding it away, which is why the options are passed in.
 */
function StayTimeSheet({
  open,
  onClose,
  title,
  stored,
  value,
  quickTimes,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  stored: string;
  value: string;
  /** Arrival and departure have different common answers; the row decides which. */
  quickTimes: readonly string[];
  onSelect: (value: string) => void;
}) {
  const { resolve } = useI18n();
  const [draft, setDraft] = useState(value);
  // The sheet is unmounted while closed, so a fresh open starts from the stored value
  // without a synchronising effect. This keeps the two in step if the row re-renders
  // with a new value while open — a second tab saving, for instance.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  return (
    <SheetPanel
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <button
          type="button"
          onClick={() => onSelect(draft)}
          className={SHEET_PRIMARY_BUTTON}
        >
          <Tx k="listing.house_rules.sheet_save" source="Save" />
        </button>
      }
    >
      <TimePickerField
        variant="inline"
        ariaLabel={title}
        value={draft}
        onChange={setDraft}
        options={stayTimeChoices(stored)}
        quickTimes={quickTimes}
        flexibleLabel={
          resolve(
            "host.editor.house_rules.flexible_option",
            "Flexible — agree with the guest",
          ).text
        }
      />
      <p>
        <Tx
          k="host.editor.house_rules.times_note"
          source="Check-out is the morning after the last night, so an earlier time than check-in is normal."
        />
      </p>
    </SheetPanel>
  );
}

/**
 * Quiet hours: whether they apply, and when — however many stretches "when" takes.
 *
 * A list rather than one range, because hosts really have more than one: the overnight
 * rule everybody has, and the afternoon one a shared wall or a sleeping child needs. Both
 * are true at once, and a single pair of fields can only ever hold the first.
 *
 * Confirmed rather than committed on change, the way it always was — a host who picks
 * "Set quiet hours" has answered half a question, and closing on that would store a rule
 * with no times in it. Save stays disabled until every period reads as a rule a guest
 * could follow, and says under the offending row why not.
 *
 * A period's two times are never compared for direction: 22:00–08:00 crosses midnight and
 * is the ordinary case. Two *different* periods are compared, on the clock face rather
 * than on the numbers, which is the only way an overnight one can be told apart from an
 * afternoon one it does not touch.
 */
function QuietHoursSheet({
  open,
  onClose,
  title,
  idPrefix,
  rules,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  idPrefix: string;
  rules: ListingHouseRulesInput;
  onApply: (patch: Partial<ListingHouseRulesInput>) => void;
}) {
  const i18n = useI18n();
  const [policy, setPolicy] = useState<QuietHoursPolicy | null>(rules.quietHoursPolicy);
  const [periods, setPeriods] = useState<QuietHoursPeriod[]>(() =>
    editablePeriods(rules),
  );
  const [seen, setSeen] = useState(rules);
  if (seen !== rules) {
    setSeen(rules);
    setPolicy(rules.quietHoursPolicy);
    setPeriods(editablePeriods(rules));
  }

  const issues = quietHoursPeriodIssues(periods);
  const tooMany = periods.length > QUIET_HOURS_PERIODS_MAX;
  const complete =
    policy === "NONE" ||
    (policy === "SET" &&
      periods.length > 0 &&
      !tooMany &&
      issues.every((issue) => issue === undefined));

  const patch = (index: number, part: Partial<QuietHoursPeriod>) =>
    setPeriods((current) =>
      current.map((period, i) => (i === index ? { ...period, ...part } : period)),
    );

  const fromLabel = i18n.resolve("listing.house_rules.quiet_hours.start", "From").text;
  const untilLabel = i18n.resolve("listing.house_rules.quiet_hours.end", "Until").text;

  return (
    <SheetPanel
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <button
          type="button"
          disabled={!complete}
          onClick={() =>
            onApply(
              policy === "SET"
                ? {
                    quietHoursPolicy: "SET",
                    quietHoursPeriods: periods,
                    // The mirrored pair travels with the list rather than being left for
                    // normalisation to derive, so the caller's optimistic state already
                    // matches what will be stored and the row never shows a stale range.
                    quietHoursStart: periods[0]?.start ?? "",
                    quietHoursEnd: periods[0]?.end ?? "",
                  }
                : {
                    quietHoursPolicy: "NONE",
                    quietHoursPeriods: [],
                    quietHoursStart: "",
                    quietHoursEnd: "",
                  },
            )
          }
          className={SHEET_PRIMARY_BUTTON}
        >
          <Tx k="listing.house_rules.sheet_save" source="Save" />
        </button>
      }
    >
      <div role="radiogroup" aria-label={title} className="space-y-2">
        {quietHoursChoices(i18n).map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={policy === choice.value}
            onClick={() => {
              setPolicy(choice.value);
              // Turning quiet hours back on with nothing in the list would show a host an
              // empty panel and a disabled Save. One period to edit is the answer they
              // were about to give anyway.
              if (choice.value === "SET" && periods.length === 0) {
                setPeriods([DEFAULT_QUIET_HOURS_PERIOD]);
              }
            }}
            className={cn(
              "flex w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
              policy === choice.value
                ? "border-slate-900 bg-slate-50"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <span className="text-sm font-semibold text-slate-900">{choice.label}</span>
            <span className="text-sm leading-6 text-slate-600">
              {choice.description}
            </span>
          </button>
        ))}
      </div>

      {policy === "SET" ? (
        <div className="space-y-3">
          {periods.map((period, index) => (
            <div
              key={index}
              data-quiet-period={index}
              className="rounded-2xl border border-slate-200 p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <QuietHoursTimeField
                  id={`${idPrefix}-quiet-hours-start-${index}`}
                  label={fromLabel}
                  stored={period.start}
                  value={period.start}
                  onChange={(start) => patch(index, { start })}
                />
                <QuietHoursTimeField
                  id={`${idPrefix}-quiet-hours-end-${index}`}
                  label={untilLabel}
                  stored={period.end}
                  value={period.end}
                  onChange={(end) => patch(index, { end })}
                />
              </div>
              {issues[index] ? (
                <p role="alert" className="mt-3 text-sm leading-6 text-rose-600">
                  {quietHoursPeriodError(
                    i18n,
                    issues[index] as QuietHoursPeriodIssue,
                    QUIET_HOURS_PERIODS_MAX,
                  )}
                </p>
              ) : null}
              {/* Never offered on the last one. Removing it would leave "quiet hours
                  apply" with no hours in it, which is the half-answered rule this sheet
                  exists to prevent — "No quiet hours" above is how a host clears them. */}
              {periods.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setPeriods((current) => current.filter((_, i) => i !== index))
                  }
                  aria-label={
                    interpolate(
                      i18n.resolve(
                        "listing.house_rules.quiet_hours.remove_period",
                        "Remove quiet period {number}",
                      ),
                      { number: index + 1 },
                    ).text
                  }
                  className={cn(
                    "mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600",
                    "underline underline-offset-4 transition-colors hover:text-slate-900",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
                  )}
                >
                  <Trash2 className="size-4" aria-hidden />
                  <Tx k="listing.house_rules.quiet_hours.remove" source="Remove" />
                </button>
              ) : null}
            </div>
          ))}

          <button
            type="button"
            disabled={periods.length >= QUIET_HOURS_PERIODS_MAX}
            onClick={() =>
              // Blank rather than prefilled. Any second range this could invent would
              // either overlap the first or be a guess about an afternoon whose shape
              // only the host knows, and both are worse than one empty pair of pickers.
              setPeriods((current) => [...current, { start: "", end: "" }])
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2",
              "text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Plus className="size-4" aria-hidden />
            <Tx
              k="listing.house_rules.quiet_hours.add_period"
              source="Add another quiet period"
            />
          </button>

          <p>
            <Tx
              k="listing.house_rules.quiet_hours.overnight_note"
              source="Quiet hours usually run overnight, so an end time earlier than the start is normal."
            />
          </p>
        </div>
      ) : null}
    </SheetPanel>
  );
}

/** What a host who has never set quiet hours is shown first: the range almost all of them
 *  mean. Only ever used to seed an empty list — never written on its own. */
const DEFAULT_QUIET_HOURS_PERIOD: QuietHoursPeriod = { start: "22:00", end: "08:00" };

/**
 * The list the sheet opens on.
 *
 * A listing that already has periods opens on those; one holding the single stored range
 * opens on that range, which is what `normalizeQuietHoursPeriods` makes of the legacy
 * pair; anything else gets the default, so the panel is never an empty box above a
 * disabled Save.
 */
function editablePeriods(rules: ListingHouseRulesInput): QuietHoursPeriod[] {
  const stored = normalizeQuietHoursPeriods(rules.quietHoursPeriods, {
    start: rules.quietHoursStart,
    end: rules.quietHoursEnd,
  });
  return stored.length > 0 ? stored : [DEFAULT_QUIET_HOURS_PERIOD];
}

function QuietHoursTimeField({
  id,
  label,
  stored,
  value,
  onChange,
}: {
  id: string;
  label: string;
  stored: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-medium text-slate-900">
        {label}
      </label>
      {/* A popover, not the sheet's inline shape: two of these sit side by side, and two
          expanded grids would be most of the panel. No quick times either — quiet hours
          have no handful of answers the way arrival does, and no flexible option, since
          the sheet's Save already refuses a half-answered range. */}
      <TimePickerField
        id={id}
        className="mt-2"
        value={value}
        onChange={onChange}
        options={stayTimeChoices(stored)}
        ariaLabel={label}
      />
    </div>
  );
}

/**
 * The host's own rules, in their own words.
 *
 * Confirmed rather than committed on every keystroke: this is the one control on the
 * screen where the host is composing rather than choosing, and an autosave per character
 * would send a write for every letter. Stored exactly as typed — the counter warns, and
 * Save refuses, rather than truncating a sentence the host is halfway through.
 */
function AdditionalRulesSheet({
  open,
  onClose,
  title,
  idPrefix,
  value,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  idPrefix: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const i18n = useI18n();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const tooLong = draft.trim().length > ADDITIONAL_RULES_MAX;
  const id = `${idPrefix}-additional-rules-input`;

  return (
    <SheetPanel
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <button
          type="button"
          disabled={tooLong}
          onClick={() => onApply(draft.trim())}
          className={SHEET_PRIMARY_BUTTON}
        >
          <Tx k="listing.house_rules.sheet_save" source="Save" />
        </button>
      }
    >
      <label htmlFor={id} className="block text-sm text-slate-600">
        <Tx
          k="listing.house_rules.additional_rules_hint"
          source="Anything else guests should agree to — the bins, the neighbours, the parking space. Guests read this before they book."
        />
      </label>
      <textarea
        id={id}
        value={draft}
        rows={6}
        onChange={(event) => setDraft(event.target.value)}
        aria-invalid={tooLong}
        aria-describedby={`${id}-count`}
        className={cn(
          "w-full rounded-xl border p-3 text-sm leading-6 text-slate-900",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20",
          tooLong ? "border-rose-400" : "border-slate-300 hover:border-slate-400",
        )}
      />
      <p
        id={`${id}-count`}
        className={cn("text-xs", tooLong ? "text-rose-600" : "text-slate-500")}
      >
        {
          interpolate(
            i18n.resolve(
              "listing.house_rules.additional_rules_count",
              "{used} of {max} characters",
            ),
            { used: draft.trim().length, max: ADDITIONAL_RULES_MAX },
          ).text
        }
      </p>
    </SheetPanel>
  );
}

// ─── Small shared bits ───────────────────────────────────────────────────────────

/** The row's own summary: every period on one line, so a host with two of them can see
 *  both without opening the sheet. "Add times" still covers the half-answered rule, which
 *  is now any period missing an end rather than only the first one. */
function quietHoursValue(
  i18n: ReturnType<typeof useI18n>,
  rules: ListingHouseRulesInput,
  unanswered: string,
): string {
  if (rules.quietHoursPolicy === null) return unanswered;
  if (rules.quietHoursPolicy === "NONE") return quietHoursNoneLabel(i18n);
  const periods = normalizeQuietHoursPeriods(rules.quietHoursPeriods, {
    start: rules.quietHoursStart,
    end: rules.quietHoursEnd,
  });
  if (
    periods.length === 0 ||
    periods.some((period) => period.start === "" || period.end === "")
  ) {
    return i18n.resolve("listing.house_rules.quiet_hours.incomplete", "Add times").text;
  }
  return quietHoursPeriodsLabel(periods);
}

function requiredError(i18n: ReturnType<typeof useI18n>): string {
  return i18n.resolve(
    "listing.house_rules.error_required",
    "Choose an answer so guests know where they stand.",
  ).text;
}

function stayTimeError(i18n: ReturnType<typeof useI18n>): string {
  return i18n.resolve(
    "listing.house_rules.error_stay_time",
    "That is not a valid time of day.",
  ).text;
}

function quietHoursError(i18n: ReturnType<typeof useI18n>): string {
  return i18n.resolve(
    "listing.house_rules.error_quiet_hours",
    "Set both a start and an end time for quiet hours.",
  ).text;
}

function additionalRulesError(i18n: ReturnType<typeof useI18n>): string {
  return i18n.resolve(
    "listing.house_rules.error_additional_rules",
    "Your additional rules are too long. Shorten them and save again.",
  ).text;
}
