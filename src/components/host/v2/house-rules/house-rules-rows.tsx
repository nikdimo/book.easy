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
  stayTimeChoices,
  type EventPolicy,
  type ListingHouseRulesInput,
  type ListingHouseRulesIssues,
  type PetPolicy,
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
  quietHoursRangeLabel,
  smokingPolicyChoices,
  smokingPolicyLabel,
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
  /** Shown under the guest stepper. The editor puts its booked-party warning here; the
   *  flow has no bookings to warn about. */
  guestFooter?: React.ReactNode;
}) {
  const i18n = useI18n();
  const titles = houseRulesRowTitles(i18n);
  const sections = houseRulesSectionTitles(i18n);
  const unanswered = unansweredLabel(i18n);
  const flexible = flexibleTimeLabel(i18n);

  const set = (patch: Partial<ListingHouseRulesInput>, immediate = true) =>
    onChange({ ...rules, ...patch }, immediate);

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoTrigger = useRef<HTMLButtonElement>(null);
  const close = () => setOpenRow(null);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
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

      <RuleSection title={sections.arrival} id={`${idPrefix}-arrival`}>
        <RuleRow
          id={`${idPrefix}-check-in`}
          icon={CalendarCheck}
          title={titles.checkIn}
          value={rules.checkInTime === FLEXIBLE_STAY_TIME ? flexible : rules.checkInTime}
          error={showIssues && issues.checkInTime ? stayTimeError(i18n) : null}
          onOpen={() => setOpenRow("check-in")}
        />
        <RuleRow
          id={`${idPrefix}-check-out`}
          icon={CalendarClock}
          title={titles.checkOut}
          value={
            rules.checkOutTime === FLEXIBLE_STAY_TIME ? flexible : rules.checkOutTime
          }
          error={showIssues && issues.checkOutTime ? stayTimeError(i18n) : null}
          onOpen={() => setOpenRow("check-out")}
        />
      </RuleSection>

      <RuleSection title={sections.guests} id={`${idPrefix}-guests`}>
        <div className="flex items-center justify-between gap-4 py-3.5">
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

      <RuleSection title={sections.rules} id={`${idPrefix}-policies`}>
        <RuleRow
          id={`${idPrefix}-pets`}
          icon={PawPrint}
          title={titles.pets}
          value={rules.petPolicy ? petPolicyLabel(i18n, rules.petPolicy) : unanswered}
          unanswered={rules.petPolicy === null}
          error={showIssues && issues.petPolicy ? requiredError(i18n) : null}
          onOpen={() => setOpenRow("pets")}
        />
        <RuleRow
          id={`${idPrefix}-smoking`}
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
          id={`${idPrefix}-events`}
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
          id={`${idPrefix}-quiet-hours`}
          icon={VolumeX}
          title={titles.quietHours}
          value={quietHoursValue(i18n, rules, unanswered)}
          unanswered={rules.quietHoursPolicy === null}
          error={
            showIssues &&
            (issues.quietHoursPolicy || issues.quietHoursStart || issues.quietHoursEnd)
              ? issues.quietHoursPolicy
                ? requiredError(i18n)
                : quietHoursError(i18n)
              : null
          }
          onOpen={() => setOpenRow("quiet-hours")}
        />
      </RuleSection>

      <RuleSection title={sections.additional} id={`${idPrefix}-additional`}>
        <RuleRow
          id={`${idPrefix}-additional-rules`}
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
  children,
}: {
  id: string;
  title: string;
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
  error,
  onOpen,
}: {
  id: string;
  icon: typeof PawPrint;
  title: string;
  value?: string;
  subtitle?: string;
  unanswered?: boolean;
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
        // reader would ignore it. The error is announced instead — it is a live region,
        // and `aria-describedby` reads it out as part of the row's description.
        aria-describedby={error ? `${id}-error` : undefined}
        className="flex w-full items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Icon className="size-[1.15rem] shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-900">
              {title}
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
                unanswered ? "text-slate-400" : "text-slate-600",
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
          role="alert"
          aria-live="polite"
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
 * Quiet hours: whether they apply, and when.
 *
 * Both ends or neither, so this sheet confirms rather than committing on choice — a host
 * who picks "Set quiet hours" has answered half a question, and closing on that would
 * store a rule with no times in it. Save stays disabled until both ends are set.
 *
 * The two times are never compared. 22:00–08:00 is the ordinary case, and a
 * start-before-end rule would reject almost every real answer.
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
  const [start, setStart] = useState(rules.quietHoursStart || "22:00");
  const [end, setEnd] = useState(rules.quietHoursEnd || "08:00");
  const [seen, setSeen] = useState(rules);
  if (seen !== rules) {
    setSeen(rules);
    setPolicy(rules.quietHoursPolicy);
    setStart(rules.quietHoursStart || "22:00");
    setEnd(rules.quietHoursEnd || "08:00");
  }

  const complete = policy === "NONE" || (policy === "SET" && start !== "" && end !== "");

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
                    quietHoursStart: start,
                    quietHoursEnd: end,
                  }
                : {
                    quietHoursPolicy: "NONE",
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
            onClick={() => setPolicy(choice.value)}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <QuietHoursTimeField
            id={`${idPrefix}-quiet-hours-start`}
            label={
              i18n.resolve("listing.house_rules.quiet_hours.start", "From").text
            }
            stored={rules.quietHoursStart}
            value={start}
            onChange={setStart}
          />
          <QuietHoursTimeField
            id={`${idPrefix}-quiet-hours-end`}
            label={i18n.resolve("listing.house_rules.quiet_hours.end", "Until").text}
            stored={rules.quietHoursEnd}
            value={end}
            onChange={setEnd}
          />
          <p className="sm:col-span-2">
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

function quietHoursValue(
  i18n: ReturnType<typeof useI18n>,
  rules: ListingHouseRulesInput,
  unanswered: string,
): string {
  if (rules.quietHoursPolicy === null) return unanswered;
  if (rules.quietHoursPolicy === "NONE") return quietHoursNoneLabel(i18n);
  if (rules.quietHoursStart === "" || rules.quietHoursEnd === "") {
    return i18n.resolve("listing.house_rules.quiet_hours.incomplete", "Add times").text;
  }
  return quietHoursRangeLabel(rules.quietHoursStart, rules.quietHoursEnd);
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
