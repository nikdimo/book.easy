"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, Check, History, TriangleAlert } from "lucide-react";
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
import { Field } from "@/components/host/v2/calendar/workbench-ui";
import { cn } from "@/lib/utils";
import { LAB_TODAY, NIGHTLY_PRICING, QUICK_SETUP_EXAMPLE } from "./fixtures";
import { dayMonth, money, monthYear, stayRangeLabel, weekdayDayMonth } from "./display";
import {
  FIELD_CONTROL,
  MonthHeading,
  PillChoice,
  StateBadge,
} from "./surfaces";
import {
  PanelAlert,
  PanelSection,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "./panel-chrome";
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

/**
 * Managing the stays a fixed-stay listing offers, inside the Calendar's editing panel.
 *
 * Everything about the behaviour is the version already approved on the wide lab page —
 * the two ways in, the preview before anything is created, duplicates skipped and
 * overlaps allowed with an explanation, the month grouping, and the rows a host may
 * look at but not touch. What changed is the column it has to live in: 23rem on a
 * desktop and the full width of a phone, which is one field per row, no card inside a
 * card, and no list with a scrollbar of its own inside a panel that already scrolls.
 */

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

/** The row-level action shape the panel already uses in its scheduled-changes list. */
const ROW_ACTION =
  "min-h-11 rounded-lg px-2 text-[0.75rem] font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2";

function lengthsFor(choice: LengthChoice): FixedStayLength[] {
  if (choice === "week") return [7];
  if (choice === "fortnight") return [14];
  return [7, 14];
}

function choiceFor(lengths: readonly FixedStayLength[]): LengthChoice {
  if (lengths.length > 1) return "both";
  return lengths[0] === 14 ? "fortnight" : "week";
}

export function FixedStaysEditor({
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
  const hidden = resolved.length - offered.length;

  return (
    <>
      <PanelSection id="fixed-stays-add-heading" title="Add stays">
        <PillChoice<AddMode>
          label="How would you like to add stays?"
          value={addMode}
          compact
          onChange={(next) => {
            setAddMode(next);
            setEditingId(null);
          }}
          options={[
            { value: "quick", label: "Quick setup" },
            { value: "manual", label: "Add one" },
          ]}
        />
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
      </PanelSection>

      <PanelSection
        id="fixed-stays-list-heading"
        title="Stay periods"
        aside={
          <span className="text-[0.75rem] text-slate-500">
            {offered.length} offered
            {hidden > 0 ? ` · ${hidden} hidden from guests` : ""}
          </span>
        }
      >
        {resolved.length === 0 ? (
          <div className="rounded-xl bg-slate-50">
            <EmptyState
              icon={CalendarCheck2}
              title="No stay periods yet"
              description="Until you add one, this listing has nothing a guest can book."
            />
          </div>
        ) : (
          /* No scroller of its own. The panel body is the one thing that scrolls on
             this surface, and a second one inside it is how a host ends up dragging a
             12px bar inside a 23rem column to reach August. */
          <div>
            {groupByMonth(resolved).map((group) => (
              <div key={group.month}>
                <MonthHeading count={group.items.length}>
                  {monthYear(group.month)}
                </MonthHeading>
                <ul className="flex flex-col gap-0.5">
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
            ))}
          </div>
        )}
      </PanelSection>
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
        <Field label="Season start" htmlFor="fixed-stays-season-start">
          <DatePickerField
            id="fixed-stays-season-start"
            min={LAB_TODAY}
            value={draft.seasonStart}
            onChange={(seasonStart) => update({ seasonStart })}
            invalid={showError && issue === "MISSING_START"}
            describedBy={showError && issue ? errorId : undefined}
            className={FIELD_CONTROL}
          />
        </Field>

        <Field
          label="Last checkout"
          htmlFor="fixed-stays-season-end"
          hint="The last day a guest may leave, not arrive."
        >
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
        </Field>

        <Field label="Changeover day" htmlFor="fixed-stays-changeover">
          <Select
            value={String(draft.changeoverWeekday)}
            onValueChange={(value) =>
              update({ changeoverWeekday: Number(value) as Weekday })
            }
          >
            {/* The select's own height, border and shadow, restated at the same
                specificity so the merge can actually drop them: `data-[size=default]`
                outranks a bare `h-11`, and only a class carrying the same modifiers
                replaces it. */}
            <SelectTrigger
              id="fixed-stays-changeover"
              className={cn(
                FIELD_CONTROL,
                "justify-between border-slate-300 shadow-none md:data-[size=default]:h-11",
              )}
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
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[0.8125rem] font-semibold text-slate-700">
            Allowed stay duration
          </span>
          <PillChoice<LengthChoice>
            label="Allowed stay duration"
            value={choiceFor(draft.lengths)}
            compact
            onChange={(choice) => update({ lengths: lengthsFor(choice) })}
            options={[
              { value: "week", label: "7 nights" },
              { value: "fortnight", label: "14 nights" },
              { value: "both", label: "Both" },
            ]}
          />
        </div>

        <PanelAlert id={errorId}>
          {showError && issue ? QUICK_ISSUE_TEXT[issue] : ""}
        </PanelAlert>

        {result ? (
          <p className="flex items-start gap-2 text-[0.8125rem] leading-5 text-slate-900">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
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
            size="lg"
            className={PRIMARY_BUTTON}
            onClick={() => {
              if (issue) {
                setShowError(true);
                const target =
                  issue === "MISSING_START" ||
                  issue === "INVALID_DATE" ||
                  issue === "SEASON_ENDED"
                    ? "fixed-stays-season-start"
                    : issue === "NO_LENGTHS"
                      ? null
                      : "fixed-stays-season-end";
                if (target) {
                  document.getElementById(target)?.focus();
                } else {
                  document
                    .querySelector<HTMLElement>(
                      '[role="group"][aria-label="Allowed stay duration"] button',
                    )
                    ?.focus();
                }
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
    <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
      <p className="text-[0.8125rem] leading-5 text-slate-600">
        <span className="font-semibold text-slate-900">
          {rows.length} {rows.length === 1 ? "stay" : "stays"}
        </span>{" "}
        from this season — {newCount} new
        {skipped > 0 ? `, ${skipped} already offered` : ""}.
      </p>

      <div>
        {groupByMonth(rows).map((group) => (
          <div key={group.month}>
            <MonthHeading count={group.items.length}>
              {monthYear(group.month)}
            </MonthHeading>
            <ul className="flex flex-col">
              {group.items.map((row) => (
                <li
                  key={`${row.checkIn}-${row.nights}`}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1",
                    row.duplicate && "opacity-45",
                  )}
                >
                  <span
                    className="notranslate text-[0.8125rem] font-medium text-slate-900"
                    translate="no"
                  >
                    {weekdayDayMonth(row.checkIn)} → {weekdayDayMonth(row.checkOut)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[0.75rem] text-slate-500">
                      {LENGTH_LABEL[row.nights]}
                    </span>
                    {row.duplicate ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[0.6875rem] font-medium text-slate-500">
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

      <p className="text-[0.75rem] leading-4 text-slate-500">
        Only the {newCount} new {newCount === 1 ? "stay is" : "stays are"} added. A date
        you already offer is skipped and left exactly as it is — including anything a
        guest has booked, and anything you have switched off.
      </p>

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          size="lg"
          className={PRIMARY_BUTTON}
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
          size="lg"
          className={QUIET_BUTTON}
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
      document.getElementById("fixed-stays-check-in")?.focus();
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
    <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
      <Field label="Check-in" htmlFor="fixed-stays-check-in">
        <DatePickerField
          id="fixed-stays-check-in"
          min={LAB_TODAY}
          value={draft.checkIn}
          onChange={(checkIn) => setDraft((current) => ({ ...current, checkIn }))}
          invalid={Boolean(showError && issue)}
          describedBy={showError && issue ? errorId : undefined}
          className={FIELD_CONTROL}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-slate-700">Length</span>
        <PillChoice<`${FixedStayLength}`>
          label="Length"
          value={`${draft.nights}`}
          compact
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

      {/* Read-only on purpose: checkout is derived from the length, never typed. */}
      <p aria-live="polite" className="text-[0.8125rem] leading-5 text-slate-600">
        {checkOut ? (
          <>
            Guests check out{" "}
            <span className="notranslate font-semibold text-slate-900" translate="no">
              {weekdayDayMonth(checkOut)}
            </span>{" "}
            · {draft.nights} nights
          </>
        ) : (
          "Pick a check-in date and the checkout is worked out from the length."
        )}
      </p>

      <PanelAlert id={errorId}>
        {showError && issue ? ISSUE_TEXT[issue] : ""}
      </PanelAlert>

      {/* A warning, not a refusal — overlapping options are how a host offers
          "one week or two from the 1st". */}
      {overlaps.length > 0 && !issue ? (
        <p className="flex items-start gap-2 text-[0.75rem] leading-4 text-amber-700">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          size="lg"
          className={PRIMARY_BUTTON}
          onClick={submit}
        >
          {editingId ? "Save changes" : "Add stay"}
        </Button>
        {editingId ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className={QUIET_BUTTON}
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
        "rounded-xl px-2.5 py-2 transition-colors duration-150 motion-reduce:transition-none",
        editing ? "bg-[#f8fafc] ring-1 ring-inset ring-[#0f172a]" : "hover:bg-slate-50",
        quiet && "opacity-60",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {period.state === "PAST" ? (
          <History className="size-3.5 shrink-0 text-slate-400" aria-hidden />
        ) : null}
        <span
          className="notranslate text-[0.875rem] font-semibold text-slate-900"
          translate="no"
        >
          {weekdayDayMonth(period.checkIn)} → {weekdayDayMonth(period.checkOut)}
        </span>
        <StateBadge state={period.state} audience="host" />
      </p>
      <p className="mt-0.5 text-[0.75rem] leading-4 text-slate-500">
        {period.nights} nights ·{" "}
        <span className="notranslate tabular-nums" translate="no">
          {money(quote.total)}
        </span>{" "}
        total
        {quote.discountAmount > 0 ? (
          <> · <span className="font-medium text-slate-900">offer applied</span></>
        ) : null}
      </p>
      <PeriodNote period={period} />

      {/* Three dimmed controls on a booked stay are three invitations to press
          something that does nothing. A locked row shows none of them — the sentence
          above already says why, which is the answer the host actually wants. */}
      {locked ? null : (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="-ml-2 flex items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className={cn(
                ROW_ACTION,
                "text-[#0f172a] hover:bg-white focus-visible:outline-[#0f172a]",
              )}
            >
              Edit
              <span className="sr-only"> {label}</span>
            </button>
            <button
              type="button"
              onClick={onRemove}
              className={cn(
                ROW_ACTION,
                "text-red-700 hover:bg-red-50 focus-visible:outline-red-700",
              )}
            >
              Remove
              <span className="sr-only"> {label}</span>
            </button>
          </span>
          <Switch
            checked={!period.disabled}
            onCheckedChange={onToggle}
            aria-label={`Offer ${label} to guests`}
            className="shrink-0"
          />
        </div>
      )}
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
    <p className="mt-1 text-[0.75rem] leading-4 text-slate-500">{note}</p>
  );
}
