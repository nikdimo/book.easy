"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarRange,
  Check,
  History,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DatePickerField } from "@/components/shared/date-picker-field";
import { EmptyState } from "@/components/shared/empty-state";
import { StepperColumn } from "@/components/host/v2/calendar/workbench-ui";
import { cn } from "@/lib/utils";
import { LAB_TODAY, NIGHTLY_PRICING, QUICK_SETUP_EXAMPLE } from "./fixtures";
import { dayMonth, money, monthYear, stayRangeLabel, weekdayDayMonth } from "./display";
import {
  CARD,
  CARD_PRESSABLE,
  CARD_SELECTED,
  ChoiceCard,
  FIELD_CONTROL,
  FieldLabel,
  MonthHeading,
  PillChoice,
  Section,
  StateBadge,
} from "./surfaces";
import {
  FIXED_STAY_LENGTHS,
  checkOutFor,
  draftIssue,
  groupByMonth,
  overlappingPeriods,
  quoteForPeriod,
  resolvePeriodsForHost,
  type CalendarBlock,
  type FixedStayDraftIssue,
  type FixedStayLength,
  type FixedStayPeriod,
  type FixedStayPeriodDraft,
  type ResolvedFixedStayPeriod,
} from "./periods";
import {
  CHANGEOVER_WEEKDAYS,
  newStaysFrom,
  quickSetupIssue,
  quickSetupPreview,
  weekdayLabel,
  type QuickSetupDraft,
  type QuickSetupIssue,
  type Weekday,
} from "./quick-setup";

export type BookingMode = "flexible" | "fixed";
type AddMode = "quick" | "manual";
/** The three allowed-duration answers reduce to these generated night counts. */
type LengthChoice = "week" | "fortnight" | "both";

const EMPTY_DRAFT: FixedStayPeriodDraft = { checkIn: "", nights: 7 };

const ISSUE_TEXT: Record<FixedStayDraftIssue, string> = {
  MISSING_DATE: "Choose the check-in date for this stay.",
  INVALID_DATE: "That isn't a valid date.",
  PAST_DATE: "That date has already passed. Choose today or a later date.",
  DUPLICATE: "You already offer this exact check-in and checkout.",
};

const QUICK_ISSUE_TEXT: Record<QuickSetupIssue, string> = {
  MISSING_START: "Choose the first day of the season.",
  MISSING_END: "Choose the last day a guest may check out.",
  INVALID_DATE: "One of those isn't a valid date.",
  NO_LENGTHS: "Choose how long the stays are.",
  SEASON_REVERSED: "The last checkout has to come after the season starts.",
  SEASON_ENDED: "That season has already finished.",
  SEASON_TOO_LONG: "Seasons run up to about 18 months. Split a longer one in two.",
  TOO_MANY_PERIODS: "That would add more than 200 stays. Try a shorter season.",
  NOTHING_TO_GENERATE:
    "No whole stay fits between those dates. Try a longer season or a shorter stay.",
};

const LENGTH_LABEL: Record<FixedStayLength, string> = {
  7: "7 nights",
  14: "14 nights",
};

function lengthsFor(choice: LengthChoice): FixedStayLength[] {
  if (choice === "week") return [7];
  if (choice === "fortnight") return [14];
  return [7, 14];
}

function choiceFor(lengths: readonly FixedStayLength[]): LengthChoice {
  if (lengths.length > 1) return "both";
  return lengths[0] === 14 ? "fortnight" : "week";
}

/**
 * The host half of the mockup.
 *
 * A full-width editor page rather than the Calendar's narrow pane: the stay list and the
 * Quick setup preview are both lists of dates, and a 23rem column truncated every one of
 * them. Wide enough for two fields side by side is the width this content wants.
 */
export function HostPanel({
  mode,
  onModeChange,
  periods,
  blocks,
  onPeriodsChange,
}: {
  mode: BookingMode;
  onModeChange: (mode: BookingMode) => void;
  periods: FixedStayPeriod[];
  blocks: CalendarBlock[];
  onPeriodsChange: (periods: FixedStayPeriod[]) => void;
}) {
  const [minNights, setMinNights] = useState(5);

  return (
    <div className="flex w-full flex-col gap-10">
      <Section title="How can guests book these dates?">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">How can guests book these dates?</legend>
          <ChoiceCard
            name="fixedStaysBookingMode"
            value="flexible"
            checked={mode === "flexible"}
            onSelect={() => onModeChange("flexible")}
            icon={<CalendarRange className="size-5" strokeWidth={1.8} />}
            title="Flexible dates"
            hint="Guests choose their own check-in and checkout, within your minimum stay."
          />
          <ChoiceCard
            name="fixedStaysBookingMode"
            value="fixed"
            checked={mode === "fixed"}
            onSelect={() => onModeChange("fixed")}
            icon={<CalendarCheck2 className="size-5" strokeWidth={1.8} />}
            title="Fixed stays"
            hint="Guests can only book the exact stays you add. Nothing else on the calendar is bookable."
          />
        </fieldset>
      </Section>

      {mode === "flexible" ? (
        // Unchanged: the same minimum-stay control, wording and bounds a host meets
        // today. Choosing flexible changes nothing for them.
        <Section title="Minimum stay">
          <div
            className={cn(
              CARD,
              "flex flex-wrap items-center justify-between gap-4 p-5",
            )}
          >
            <p className="max-w-sm text-[0.9375rem] leading-6 text-slate-500">
              Applies to every date. You can set different minimums per date on the
              calendar.
            </p>
            <StepperColumn
              label="Minimum stay"
              caption={minNights <= 1 ? "any length" : "nights minimum"}
              value={minNights}
              min={1}
              decrementLabel="Fewer nights"
              incrementLabel="More nights"
              onChange={setMinNights}
            />
          </div>
        </Section>
      ) : (
        <FixedStaysEditor
          periods={periods}
          blocks={blocks}
          onPeriodsChange={onPeriodsChange}
        />
      )}
    </div>
  );
}

function FixedStaysEditor({
  periods,
  blocks,
  onPeriodsChange,
}: {
  periods: FixedStayPeriod[];
  blocks: CalendarBlock[];
  onPeriodsChange: (periods: FixedStayPeriod[]) => void;
}) {
  const [addMode, setAddMode] = useState<AddMode>("quick");
  const [editingId, setEditingId] = useState<string | null>(null);
  const resolved = resolvePeriodsForHost(periods, blocks, LAB_TODAY);
  const offered = resolved.filter(
    (period) => period.state !== "PAST" && period.state !== "DISABLED",
  );

  return (
    <>
      <Section
        title="Add stays"
        aside={
          <PillChoice<AddMode>
            label="How would you like to add stays?"
            value={addMode}
            onChange={(next) => {
              setAddMode(next);
              setEditingId(null);
            }}
            options={[
              { value: "quick", label: "Quick setup" },
              { value: "manual", label: "Add one" },
            ]}
          />
        }
      >
        {addMode === "quick" ? (
          <QuickSetupForm periods={periods} onPeriodsChange={onPeriodsChange} />
        ) : (
          <ManualStayForm
            periods={periods}
            editingId={editingId}
            onEditingIdChange={setEditingId}
            onPeriodsChange={onPeriodsChange}
          />
        )}
      </Section>

      <Section
        title="Stay periods"
        aside={
          <span className="text-[0.9375rem] text-slate-500">
            {offered.length} offered
            {resolved.length > offered.length
              ? ` · ${resolved.length - offered.length} hidden from guests`
              : ""}
          </span>
        }
      >
        {resolved.length === 0 ? (
          <div className={CARD}>
            <EmptyState
              icon={CalendarCheck2}
              title="No stay periods yet"
              description="Until you add one, this listing has nothing a guest can book."
            />
          </div>
        ) : (
          groupByMonth(resolved).map((group) => (
            <div key={group.month}>
              <MonthHeading count={group.items.length} level={3}>
                {monthYear(group.month)}
              </MonthHeading>
              <ul className="flex flex-col gap-3">
                {group.items.map((period) => (
                  <PeriodRow
                    key={period.id}
                    period={period}
                    editing={editingId === period.id}
                    onEdit={() => {
                      setAddMode("manual");
                      setEditingId(period.id);
                    }}
                    onToggle={() =>
                      onPeriodsChange(
                        periods.map((item) =>
                          item.id === period.id
                            ? { ...item, disabled: !item.disabled }
                            : item,
                        ),
                      )
                    }
                    onRemove={() => {
                      onPeriodsChange(
                        periods.filter((item) => item.id !== period.id),
                      );
                      if (editingId === period.id) setEditingId(null);
                    }}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </Section>
    </>
  );
}

/**
 * Quick setup: four answers, a preview, and a confirm that only ever adds.
 *
 * The preview is the whole point of the step. A host is about to create a dozen or more
 * stays in one press, and the one thing they need first is the list — including which of
 * them the listing already offers, because those are the ones that will not be touched.
 */
function QuickSetupForm({
  periods,
  onPeriodsChange,
}: {
  periods: FixedStayPeriod[];
  onPeriodsChange: (periods: FixedStayPeriod[]) => void;
}) {
  const [draft, setDraft] = useState<QuickSetupDraft>(QUICK_SETUP_EXAMPLE);
  const [showPreview, setShowPreview] = useState(false);
  const [showError, setShowError] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(
    null,
  );

  const issue = quickSetupIssue(draft, LAB_TODAY);
  // Derived rather than frozen at press time, so editing a field after previewing
  // updates the list instead of leaving a stale one on screen.
  const rows = useMemo(
    () => (issue ? [] : quickSetupPreview(draft, periods, LAB_TODAY)),
    [draft, periods, issue],
  );
  const fresh = newStaysFrom(rows);
  const errorId = "fixed-stays-quick-error";

  const update = (patch: Partial<QuickSetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(CARD, "p-6")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="fixed-stays-season-start">Season start</FieldLabel>
            <DatePickerField
              id="fixed-stays-season-start"
              min={LAB_TODAY}
              value={draft.seasonStart}
              onChange={(seasonStart) => update({ seasonStart })}
              invalid={showError && issue === "MISSING_START"}
              describedBy={showError && issue ? errorId : undefined}
              className={FIELD_CONTROL}
            />
          </div>
          <div>
            <FieldLabel htmlFor="fixed-stays-season-end">Last checkout</FieldLabel>
            <DatePickerField
              id="fixed-stays-season-end"
              min={draft.seasonStart || LAB_TODAY}
              value={draft.seasonEnd}
              onChange={(seasonEnd) => update({ seasonEnd })}
              invalid={
                showError && (issue === "MISSING_END" || issue === "SEASON_REVERSED")
              }
              describedBy={showError && issue ? errorId : undefined}
              className={FIELD_CONTROL}
            />
            <p className="mt-2 text-[0.8125rem] leading-5 text-slate-500">
              The last day a guest may leave, not arrive.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="fixed-stays-changeover">Changeover day</FieldLabel>
            <Select
              value={String(draft.changeoverWeekday)}
              onValueChange={(value) =>
                update({ changeoverWeekday: Number(value) as Weekday })
              }
            >
              <SelectTrigger
                id="fixed-stays-changeover"
                className={cn(FIELD_CONTROL, "justify-between")}
              >
                {/* The label is passed rather than left to Radix's own item-text
                    mechanism, which only fills in after hydration — so a server-rendered
                    trigger would otherwise be blank on first paint. */}
                <SelectValue>{weekdayLabel(draft.changeoverWeekday)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CHANGEOVER_WEEKDAYS.map((day) => (
                  <SelectItem key={day.value} value={String(day.value)}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Allowed stay duration</FieldLabel>
            <div className="flex h-14 items-center">
              <PillChoice<LengthChoice>
                label="Allowed stay duration"
                value={choiceFor(draft.lengths)}
                onChange={(choice) => update({ lengths: lengthsFor(choice) })}
                options={[
                  { value: "week", label: "7 nights" },
                  { value: "fortnight", label: "14 nights" },
                  { value: "both", label: "Both" },
                ]}
              />
            </div>
          </div>
        </div>

        <p
          id={errorId}
          role="alert"
          className="mt-4 text-[0.875rem] text-rose-600 empty:hidden"
        >
          {showError && issue ? QUICK_ISSUE_TEXT[issue] : ""}
        </p>

        {result ? (
          <p className="mt-4 flex items-start gap-2 text-[0.9375rem] leading-6 text-slate-950">
            <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              Added {result.added} {result.added === 1 ? "stay" : "stays"}
              {result.skipped > 0
                ? `. ${result.skipped} you already offer ${result.skipped === 1 ? "was" : "were"} left alone.`
                : "."}
            </span>
          </p>
        ) : null}

        {!showPreview ? (
          <Button
            type="button"
            className="mt-6 h-12 rounded-full px-6 text-[0.9375rem] font-semibold"
            onClick={() => {
              if (issue) {
                setShowError(true);
                return;
              }
              setShowError(false);
              setResult(null);
              setShowPreview(true);
            }}
          >
            Preview stays
          </Button>
        ) : null}
      </div>

      {showPreview ? (
        <QuickSetupPreview
          rows={rows}
          newCount={fresh.length}
          onCancel={() => setShowPreview(false)}
          onConfirm={() => {
            onPeriodsChange([
              ...periods,
              ...fresh.map((stay) => ({
                id: `period-${stay.checkIn}-${stay.nights}`,
                checkIn: stay.checkIn,
                checkOut: stay.checkOut,
                disabled: false,
              })),
            ]);
            setResult({ added: fresh.length, skipped: rows.length - fresh.length });
            setShowPreview(false);
          }}
        />
      ) : null}
    </div>
  );
}

function QuickSetupPreview({
  rows,
  newCount,
  onCancel,
  onConfirm,
}: {
  rows: ReturnType<typeof quickSetupPreview>;
  newCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const skipped = rows.length - newCount;

  return (
    <div className={cn(CARD, "p-6")}>
      <p className="text-[0.9375rem] leading-6 text-slate-500">
        <span className="font-semibold text-slate-950">
          {rows.length} {rows.length === 1 ? "stay" : "stays"}
        </span>{" "}
        from this season — {newCount} new
        {skipped > 0 ? `, ${skipped} already offered` : ""}.
      </p>

      <div className="mt-4 max-h-80 overflow-y-auto">
        {groupByMonth(rows).map((group) => (
          <div key={group.month}>
            <MonthHeading count={group.items.length} level={3}>
              {monthYear(group.month)}
            </MonthHeading>
            <ul className="flex flex-col gap-1">
        {group.items.map((row) => (
          <li
            key={`${row.checkIn}-${row.nights}`}
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl px-3 py-2.5",
              row.duplicate ? "opacity-45" : "hover:bg-slate-50",
            )}
          >
            <span
              className="notranslate text-[0.9375rem] font-medium text-slate-950"
              translate="no"
            >
              {weekdayDayMonth(row.checkIn)} → {weekdayDayMonth(row.checkOut)}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-[0.875rem] text-slate-500">
                {LENGTH_LABEL[row.nights]}
              </span>
              {row.duplicate ? (
                <span className="rounded-full px-2 py-0.5 text-[0.75rem] font-medium text-slate-500 ring-1 ring-slate-200 ring-inset">
                  Already offered
                </span>
              ) : null}
            </span>
          </li>
        ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[0.875rem] leading-6 text-slate-500">
        Only the {newCount} new {newCount === 1 ? "stay is" : "stays are"} added. A date
        you already offer is skipped and left exactly as it is — including anything a
        guest has booked, and anything you have switched off.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="h-12 rounded-full px-6 text-[0.9375rem] font-semibold"
          disabled={newCount === 0}
          onClick={onConfirm}
        >
          {newCount === 0
            ? "Nothing new to add"
            : `Add ${newCount} ${newCount === 1 ? "stay" : "stays"}`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-12 rounded-full px-5 text-[0.9375rem]"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** One stay at a time — the same stored period Quick setup produces, typed by hand. */
function ManualStayForm({
  periods,
  editingId,
  onEditingIdChange,
  onPeriodsChange,
}: {
  periods: FixedStayPeriod[];
  editingId: string | null;
  onEditingIdChange: (id: string | null) => void;
  onPeriodsChange: (periods: FixedStayPeriod[]) => void;
}) {
  const editing = periods.find((period) => period.id === editingId) ?? null;
  const [draft, setDraft] = useState<FixedStayPeriodDraft>(EMPTY_DRAFT);
  const [showError, setShowError] = useState(false);
  // Re-seed the form when the host presses Edit on a different row.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (editing && seededFor !== editing.id) {
    setSeededFor(editing.id);
    setDraft({
      checkIn: editing.checkIn,
      nights: (editing.checkOut === checkOutFor(editing.checkIn, 14)
        ? 14
        : 7) as FixedStayLength,
    });
    setShowError(false);
  }
  if (!editing && seededFor !== null) setSeededFor(null);

  const issue = draftIssue(draft, periods, LAB_TODAY, editingId ?? undefined);
  const overlaps = useMemo(
    () => overlappingPeriods(draft, periods, editingId ?? undefined),
    [draft, periods, editingId],
  );
  const checkOut = draft.checkIn ? checkOutFor(draft.checkIn, draft.nights) : null;
  const errorId = "fixed-stays-manual-error";

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    onEditingIdChange(null);
    setShowError(false);
  };

  const submit = () => {
    if (issue) {
      setShowError(true);
      return;
    }
    const checkOutValue = checkOutFor(draft.checkIn, draft.nights);
    onPeriodsChange(
      editingId
        ? periods.map((period) =>
            period.id === editingId
              ? { ...period, checkIn: draft.checkIn, checkOut: checkOutValue }
              : period,
          )
        : [
            ...periods,
            {
              id: `period-${draft.checkIn}-${draft.nights}`,
              checkIn: draft.checkIn,
              checkOut: checkOutValue,
              disabled: false,
            },
          ],
    );
    reset();
  };

  return (
    <div className={cn(CARD, "p-6")}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="fixed-stays-check-in">Check-in</FieldLabel>
          <DatePickerField
            id="fixed-stays-check-in"
            min={LAB_TODAY}
            value={draft.checkIn}
            onChange={(checkIn) => setDraft((current) => ({ ...current, checkIn }))}
            invalid={Boolean(showError && issue)}
            describedBy={showError && issue ? errorId : undefined}
            className={FIELD_CONTROL}
          />
        </div>
        <div>
          <FieldLabel>Length</FieldLabel>
          <div className="flex h-14 items-center">
            <PillChoice<`${FixedStayLength}`>
              label="Length"
              value={`${draft.nights}`}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  nights: Number(value) as FixedStayLength,
                }))
              }
              options={FIXED_STAY_LENGTHS.map((nights) => ({
                value: `${nights}` as `${FixedStayLength}`,
                label: LENGTH_LABEL[nights],
              }))}
            />
          </div>
        </div>
      </div>

      {/* Read-only on purpose: checkout is derived from the length, never typed. */}
      <p
        aria-live="polite"
        className="mt-5 text-[0.9375rem] leading-6 text-slate-500"
      >
        {checkOut ? (
          <>
            Guests check out{" "}
            <span className="notranslate font-semibold text-slate-950" translate="no">
              {weekdayDayMonth(checkOut)}
            </span>{" "}
            · {draft.nights} nights
          </>
        ) : (
          "Pick a check-in date and the checkout is worked out from the length."
        )}
      </p>

      <p
        id={errorId}
        role="alert"
        className="mt-3 text-[0.875rem] text-rose-600 empty:hidden"
      >
        {showError && issue ? ISSUE_TEXT[issue] : ""}
      </p>

      {/* A warning, not a refusal — overlapping options are how a host offers
          "one week or two from the 1st". */}
      {overlaps.length > 0 && !issue ? (
        <p className="mt-3 flex items-start gap-2 text-[0.875rem] leading-6 text-amber-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This overlaps {overlaps.length} {overlaps.length === 1 ? "stay" : "stays"}{" "}
            you already offer (
            {overlaps
              .map((period) => stayRangeLabel(period.checkIn, period.checkOut))
              .join(", ")}
            ). Guests see all of them, but only one can be booked.
          </span>
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="h-12 rounded-full px-6 text-[0.9375rem] font-semibold"
          onClick={submit}
        >
          {editingId ? "Save changes" : "Add stay"}
        </Button>
        {editingId ? (
          <Button
            type="button"
            variant="ghost"
            className="h-12 rounded-full px-5 text-[0.9375rem]"
            onClick={reset}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PeriodRow({
  period,
  editing,
  onEdit,
  onToggle,
  onRemove,
}: {
  period: ResolvedFixedStayPeriod;
  editing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const quote = quoteForPeriod(period, NIGHTLY_PRICING);
  const label = `${stayRangeLabel(period.checkIn, period.checkOut)}, ${period.nights} nights`;
  // A booked stay is the host's promise to a guest, and a stay that has gone by is not
  // a thing to change. Neither can be edited, switched off or removed here.
  const locked = period.state === "BOOKED" || period.state === "PAST";
  const quiet = period.state === "DISABLED" || period.state === "PAST";

  return (
    <li
      className={cn(
        CARD_PRESSABLE,
        "cursor-default p-5",
        editing && CARD_SELECTED,
        quiet && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            {period.state === "PAST" ? (
              <History className="size-4 text-slate-400" aria-hidden />
            ) : null}
            <span
              className="notranslate font-heading text-[1.0625rem] font-semibold text-slate-950"
              translate="no"
            >
              {weekdayDayMonth(period.checkIn)} → {weekdayDayMonth(period.checkOut)}
            </span>
            <StateBadge state={period.state} audience="host" />
          </p>
          <p className="mt-1 text-[0.875rem] leading-5 text-slate-500">
            {period.nights} nights ·{" "}
            <span className="notranslate" translate="no">
              {money(quote.total)}
            </span>{" "}
            total
            {quote.discountAmount > 0 ? (
              <> · <span className="font-medium text-slate-950">offer applied</span></>
            ) : null}
          </p>
          <PeriodNote period={period} />
        </div>

        {/* Three dimmed controls on a booked stay are three invitations to press
            something that does nothing. A locked row shows none of them — the sentence
            underneath already says why, which is the answer the host actually wants. */}
        {locked ? null : (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              onClick={onEdit}
            >
              <Pencil className="size-4" aria-hidden />
              <span className="sr-only">Edit {label}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full text-rose-600 hover:text-rose-700"
              onClick={onRemove}
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">Remove {label}</span>
            </Button>
            <Switch
              checked={!period.disabled}
              onCheckedChange={onToggle}
              aria-label={`Offer ${label} to guests`}
              className="ml-2"
            />
          </div>
        )}
      </div>
    </li>
  );
}

/** The one sentence a row owes the host when it is not simply on offer. */
function PeriodNote({ period }: { period: ResolvedFixedStayPeriod }) {
  if (period.state === "AVAILABLE") return null;

  const note = (() => {
    if (period.state === "BOOKED") {
      return `${period.blockedBy?.label ?? "A guest"} has booked this stay, so it can't be edited or removed.`;
    }
    if (period.state === "DATES_TAKEN") {
      const block = period.blockedBy;
      const cause =
        block?.kind === "IMPORTED"
          ? `${block.label ?? "A connected calendar"} has ${dayMonth(block.start)}–${dayMonth(block.end)}`
          : block?.kind === "BOOKING"
            ? `A booking covers ${dayMonth(block.start)}–${dayMonth(block.end)}`
            : `You blocked ${block ? `${dayMonth(block.start)}–${dayMonth(block.end)}` : "some of these nights"}`;
      return `${cause}, so this stay is blocked.`;
    }
    if (period.state === "DISABLED") {
      return "Hidden from guests. You can still see it here.";
    }
    return "This stay has been and gone. Guests were never shown it after check-in day.";
  })();

  return (
    <p className="mt-2 max-w-prose text-[0.875rem] leading-5 text-slate-500">
      {note}
    </p>
  );
}
