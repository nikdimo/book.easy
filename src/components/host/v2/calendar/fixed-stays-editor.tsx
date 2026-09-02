"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import {
  addFixedStayPeriod,
  confirmFixedStayQuickSetup,
  deleteFixedStayPeriod,
  previewFixedStayQuickSetup,
  setFixedStayPeriodEnabled,
  updateFixedStayPeriod,
} from "@/lib/actions/fixed-stay.actions";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import { addDaysToYmd } from "@/lib/utils/date-only";
import {
  FIXED_STAY_NIGHTS,
  type FixedStayNights,
} from "@/lib/utils/fixed-stay-periods";
import { groupFixedStayOptionsByMonth } from "@/lib/fixed-stay-options";
import { Field, SegmentedChoice } from "./workbench-ui";
import { NoFixedStaysYet } from "./booking-method-editor";

/**
 * The stays this listing sells, and the two ways to add them.
 *
 * Everything here goes through the Phase 2 server actions and nothing is decided in the
 * browser: Quick setup previews on the server and confirms from the same four answers
 * rather than from the rows it drew, Add one sends a check-in and a length and lets the
 * server derive the checkout, and every row's available actions come from the `state`
 * and `manageable` the server projected. A booked or already-started stay renders no
 * action at all — not a disabled one — because there is nothing a host may do to it.
 *
 * No scroller of its own. The panel body is the one scrolling area on this surface, and
 * a second one inside a 23rem column is how a host ends up dragging a 12px bar to reach
 * August.
 */

/** What the host may ask Quick setup for. Both means a week *and* a fortnight. */
type LengthChoice = "7" | "14" | "both";

function lengthsFor(choice: LengthChoice): FixedStayNights[] {
  if (choice === "both") return [...FIXED_STAY_NIGHTS];
  return [Number(choice) as FixedStayNights];
}

/** Sunday = 0, the numbering `weekdayOfYmd` and `Date#getUTCDay` share. */
const CHANGEOVER_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const DEFAULT_CHANGEOVER = 6;

type PreviewRow = {
  checkIn: string;
  checkOut: string;
  nights: number;
  duplicate: boolean;
};

export function FixedStaysEditor({
  listing,
  today,
}: {
  listing: HostCalendarListing;
  today: string;
}) {
  const i18n = useI18n();
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        month: "long",
        year: "numeric",
      }),
    [i18n.locale],
  );
  const [addMode, setAddMode] = useState<"quick" | "manual">("quick");
  const [editingId, setEditingId] = useState<string | null>(null);
  const periods = listing.fixedStayPeriods;
  const offered = periods.filter(
    (period) => period.state !== "PAST" && period.state !== "DISABLED",
  ).length;
  const hidden = periods.length - offered;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="host-v2-fixed-stays-add" className="min-w-0">
        <h3
          id="host-v2-fixed-stays-add"
          className="text-[0.8125rem] font-semibold text-slate-700"
        >
          {i18n.resolve("host.v2.calendar.fixed_stays.add_title", "Add stays").text}
        </h3>
        <div className="mt-2">
          <SegmentedChoice<"quick" | "manual">
            label={
              i18n.resolve(
                "host.v2.calendar.fixed_stays.add_how",
                "How would you like to add stays?",
              ).text
            }
            value={addMode}
            onChange={(next) => {
              setAddMode(next);
              setEditingId(null);
            }}
            options={[
              {
                value: "quick",
                label: i18n.resolve(
                  "host.v2.calendar.fixed_stays.quick",
                  "Quick setup",
                ).text,
              },
              {
                value: "manual",
                label: i18n.resolve(
                  "host.v2.calendar.fixed_stays.manual",
                  "Add one",
                ).text,
              },
            ]}
          />
        </div>
        <div className="mt-3">
          {addMode === "quick" ? (
            <QuickSetupForm listingId={listing.id} today={today} />
          ) : (
            <ManualStayForm
              // Reset the form when the host moves between "add" and a particular
              // existing stay. Without the key, React keeps the previous local date
              // and length because this component occupies the same tree position.
              key={editingId ?? "new"}
              listingId={listing.id}
              today={today}
              editing={
                periods.find((period) => period.id === editingId) ?? null
              }
              onDoneEditing={() => setEditingId(null)}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="host-v2-fixed-stays-list" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3
            id="host-v2-fixed-stays-list"
            className="text-[0.8125rem] font-semibold text-slate-700"
          >
            {
              i18n.resolve(
                "host.v2.calendar.fixed_stays.list_title",
                "Stay periods",
              ).text
            }
          </h3>
          <p className="text-[0.75rem] text-slate-500 notranslate" translate="no">
            {
              i18n.plural(
                "host.v2.calendar.fixed_stays.offered",
                offered,
                "{n} offered",
                "{n} offered",
              ).text
            }
            {hidden > 0
              ? ` · ${
                  i18n.plural(
                    "host.v2.calendar.fixed_stays.hidden",
                    hidden,
                    "{n} hidden from guests",
                    "{n} hidden from guests",
                  ).text
                }`
              : ""}
          </p>
        </div>

        <div className="mt-2">
          {periods.length === 0 ? (
            <NoFixedStaysYet />
          ) : (
            groupFixedStayOptionsByMonth(
              periods.map((period) => ({
                id: period.id,
                checkIn: period.checkIn,
                checkOut: period.checkOut,
                nights: period.nights,
                selectable: period.state === "AVAILABLE",
              })),
            ).map((group) => (
              <div key={group.month} className="min-w-0">
                <p
                  className="mt-3 mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500 first:mt-0 notranslate"
                  translate="no"
                >
                  {monthFormatter.format(
                    new Date(`${group.month}-01T00:00:00Z`),
                  )}
                </p>
                <ul className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const period = periods.find((row) => row.id === item.id)!;
                    return (
                      <PeriodRow
                        key={period.id}
                        listingId={listing.id}
                        period={period}
                        editing={editingId === period.id}
                        onEdit={() => {
                          setAddMode("manual");
                          setEditingId(period.id);
                        }}
                      />
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Quick setup: four answers, a preview, and a confirm that only ever adds.
 *
 * The preview is the point of the step — a host is about to create a dozen or more stays
 * in one press, and the one thing they need first is the list, including which of them
 * the listing already offers so they can see those will not be touched. The rows are
 * *drawn* from the server's answer and never sent back: the confirm carries the same four
 * fields the preview did, and the server regenerates.
 */
function QuickSetupForm({
  listingId,
  today,
}: {
  listingId: string;
  today: string;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [seasonStart, setSeasonStart] = useState(addDaysToYmd(today, 1));
  const [lastCheckOut, setLastCheckOut] = useState(addDaysToYmd(today, 90));
  const [weekday, setWeekday] = useState<number>(DEFAULT_CHANGEOVER);
  const [choice, setChoice] = useState<LengthChoice>("7");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const weekdayNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.locale, {
      weekday: "long",
    });
    // 2024-01-07 was a Sunday, so adding the index lands on each weekday in turn.
    return CHANGEOVER_DAYS.map((value) => ({
      value,
      label: formatter.format(new Date(Date.UTC(2024, 0, 7 + value))),
    }));
  }, [i18n.locale]);

  const input = {
    seasonStart,
    lastCheckOut,
    changeoverWeekday: weekday,
    nights: lengthsFor(choice) as number[],
  };

  function preview() {
    setError(null);
    start(async () => {
      const result = await previewFixedStayQuickSetup(listingId, input);
      if ("error" in result && result.error) {
        setError(result.error);
        // Send focus to the field the answer is about, so a keyboard host is not left
        // hunting for the message. The issue is only present on the generator's own
        // refusals; an authorization refusal has no field to point at.
        const issue = "issue" in result ? result.issue : null;
        (issue === "MISSING_LAST_CHECKOUT" ||
        issue === "SEASON_REVERSED" ||
        issue === "SEASON_TOO_LONG"
          ? endRef
          : startRef
        ).current?.focus();
        setRows(null);
        return;
      }
      setRows("rows" in result ? (result.rows as PreviewRow[]) : []);
    });
  }

  function confirm() {
    setError(null);
    start(async () => {
      // The four answers again, never the rows above: the server regenerates and creates
      // only what is missing, so an approved preview and a written season come from one
      // function rather than from this browser's copy of one.
      const result = await confirmFixedStayQuickSetup(listingId, input);
      if ("error" in result && result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      const created = "created" in result ? result.created : 0;
      setRows(null);
      router.refresh();
      toast.success(
        i18n.plural(
          "host.v2.calendar.fixed_stays.added",
          created,
          "{n} stay added",
          "{n} stays added",
        ).text,
      );
    });
  }

  const newCount = rows?.filter((row) => !row.duplicate).length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={
            i18n.resolve(
              "host.v2.calendar.fixed_stays.season_start",
              "Season start",
            ).text
          }
          htmlFor="host-v2-quick-start"
        >
          <input
            ref={startRef}
            id="host-v2-quick-start"
            type="date"
            value={seasonStart}
            min={today}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setSeasonStart(event.target.value);
              setRows(null);
            }}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-[0.875rem] text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f172a]"
          />
        </Field>
        <Field
          label={
            i18n.resolve(
              "host.v2.calendar.fixed_stays.last_checkout",
              "Last checkout",
            ).text
          }
          htmlFor="host-v2-quick-end"
          hint={
            i18n.resolve(
              "host.v2.calendar.fixed_stays.last_checkout_hint",
              "The last day a guest may leave.",
            ).text
          }
        >
          <input
            ref={endRef}
            id="host-v2-quick-end"
            type="date"
            value={lastCheckOut}
            min={seasonStart}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setLastCheckOut(event.target.value);
              setRows(null);
            }}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-[0.875rem] text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f172a]"
          />
        </Field>
      </div>

      <Field
        label={
          i18n.resolve(
            "host.v2.calendar.fixed_stays.changeover",
            "Changeover day",
          ).text
        }
        htmlFor="host-v2-quick-weekday"
      >
        <select
          id="host-v2-quick-weekday"
          value={weekday}
          onChange={(event) => {
            setWeekday(Number(event.target.value));
            setRows(null);
          }}
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[0.875rem] text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f172a]"
        >
          {weekdayNames.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={
          i18n.resolve(
            "host.v2.calendar.fixed_stays.duration",
            "Stay length",
          ).text
        }
      >
        <SegmentedChoice<LengthChoice>
          label={
            i18n.resolve(
              "host.v2.calendar.fixed_stays.duration",
              "Stay length",
            ).text
          }
          value={choice}
          onChange={(next) => {
            setChoice(next);
            setRows(null);
          }}
          options={[
            {
              value: "7",
              label: i18n.resolve(
                "host.v2.calendar.fixed_stays.seven",
                "7 nights",
              ).text,
            },
            {
              value: "14",
              label: i18n.resolve(
                "host.v2.calendar.fixed_stays.fourteen",
                "14 nights",
              ).text,
            },
            {
              value: "both",
              label: i18n.resolve("host.v2.calendar.fixed_stays.both", "Both")
                .text,
            },
          ]}
        />
      </Field>

      {error ? (
        <p role="alert" className="text-[0.8125rem] leading-5 text-red-700">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={preview}
          className="self-start rounded-full"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {
            i18n.resolve(
              "host.v2.calendar.fixed_stays.preview",
              "Preview stays",
            ).text
          }
        </Button>
      ) : (
        <QuickSetupPreview
          rows={rows}
          pending={pending}
          newCount={newCount}
          onCancel={() => setRows(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

function QuickSetupPreview({
  rows,
  pending,
  newCount,
  onCancel,
  onConfirm,
}: {
  rows: PreviewRow[];
  pending: boolean;
  newCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const i18n = useI18n();
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        day: "numeric",
        month: "short",
      }),
    [i18n.locale],
  );

  return (
    <div data-quick-setup-preview className="rounded-xl border border-slate-200 p-3">
      {rows.length === 0 ? (
        <p className="text-[0.8125rem] text-slate-600">
          {
            i18n.resolve(
              "host.v2.calendar.fixed_stays.preview_empty",
              "No stays fit inside those dates.",
            ).text
          }
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={`${row.checkIn}/${row.checkOut}`}
              data-duplicate={row.duplicate ? "true" : "false"}
              className="flex flex-wrap items-baseline justify-between gap-x-2 text-[0.8125rem]"
            >
              <span
                className={cn(
                  "notranslate",
                  row.duplicate ? "text-slate-400" : "text-slate-800",
                )}
                translate="no"
              >
                {dayFormatter.format(new Date(`${row.checkIn}T00:00:00Z`))}
                {" → "}
                {dayFormatter.format(new Date(`${row.checkOut}T00:00:00Z`))}
              </span>
              <span className="text-[0.75rem] text-slate-500">
                {row.duplicate
                  ? i18n.resolve(
                      "host.v2.calendar.fixed_stays.already_offered",
                      "Already offered",
                    ).text
                  : i18n.plural(
                      "host.v2.calendar.fixed_stays.nights",
                      row.nights,
                      "{n} night",
                      "{n} nights",
                    ).text}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || newCount === 0}
          onClick={onConfirm}
          className="rounded-full"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {
            i18n.plural(
              "host.v2.calendar.fixed_stays.confirm_add",
              newCount,
              "Add {n} stay",
              "Add {n} stays",
            ).text
          }
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
          className="rounded-full"
        >
          {i18n.resolve("common.cancel", "Cancel").text}
        </Button>
      </div>
    </div>
  );
}

/**
 * One stay at a time: a check-in and a length.
 *
 * The checkout is never a field. It is derived on the server from these two, which is
 * what stops a form — or anything replaying its request — from creating a stay of a
 * length this product does not sell.
 */
function ManualStayForm({
  listingId,
  today,
  editing,
  onDoneEditing,
}: {
  listingId: string;
  today: string;
  editing: HostCalendarListing["fixedStayPeriods"][number] | null;
  onDoneEditing: () => void;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checkIn, setCheckIn] = useState(editing?.checkIn ?? addDaysToYmd(today, 1));
  const [choice, setChoice] = useState<"7" | "14">(
    editing?.nights === 14 ? "14" : "7",
  );
  const [error, setError] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState<number>(0);
  const dateRef = useRef<HTMLInputElement>(null);
  const editingId = editing?.id ?? null;

  function submit() {
    setError(null);
    setOverlaps(0);
    const nights = Number(choice);
    start(async () => {
      const result = editingId
        ? await updateFixedStayPeriod(listingId, {
            periodId: editingId,
            checkIn,
            nights,
          })
        : await addFixedStayPeriod(listingId, { checkIn, nights });
      if ("error" in result && result.error) {
        setError(result.error);
        dateRef.current?.focus();
        return;
      }
      if ("overlaps" in result && result.overlaps.length > 0) {
        setOverlaps(result.overlaps.length);
      }
      router.refresh();
      onDoneEditing();
      toast.success(
        editingId
          ? i18n.resolve(
              "host.v2.calendar.fixed_stays.updated",
              "Stay updated.",
            ).text
          : i18n.resolve("host.v2.calendar.fixed_stays.added_one", "Stay added.")
              .text,
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {editing ? (
        <p className="text-[0.8125rem] text-slate-600">
          {
            i18n.resolve(
              "host.v2.calendar.fixed_stays.editing",
              "Editing an existing stay.",
            ).text
          }
        </p>
      ) : null}
      <Field
        label={
          i18n.resolve("host.v2.calendar.fixed_stays.check_in", "Check-in").text
        }
        htmlFor="host-v2-manual-check-in"
        hint={
          i18n.resolve(
            "host.v2.calendar.fixed_stays.checkout_derived",
            "Checkout follows from the stay length you choose.",
          ).text
        }
      >
        <input
          ref={dateRef}
          id="host-v2-manual-check-in"
          type="date"
          value={checkIn}
          min={today}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setCheckIn(event.target.value);
            setError(null);
          }}
          className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-[0.875rem] text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f172a]"
        />
      </Field>

      <Field
        label={
          i18n.resolve("host.v2.calendar.fixed_stays.duration", "Stay length").text
        }
      >
        <SegmentedChoice<"7" | "14">
          label={
            i18n.resolve("host.v2.calendar.fixed_stays.duration", "Stay length")
              .text
          }
          value={choice}
          onChange={setChoice}
          options={[
            {
              value: "7",
              label: i18n.resolve(
                "host.v2.calendar.fixed_stays.seven",
                "7 nights",
              ).text,
            },
            {
              value: "14",
              label: i18n.resolve(
                "host.v2.calendar.fixed_stays.fourteen",
                "14 nights",
              ).text,
            },
          ]}
        />
      </Field>

      {error ? (
        <p role="alert" className="text-[0.8125rem] leading-5 text-red-700">
          {error}
        </p>
      ) : null}
      {overlaps > 0 ? (
        <p className="text-[0.8125rem] leading-5 text-amber-800">
          {
            i18n.plural(
              "host.v2.calendar.fixed_stays.overlap_warning",
              overlaps,
              "This shares nights with {n} other stay. Whichever a guest books withdraws the other.",
              "This shares nights with {n} other stays. Whichever a guest books withdraws the others.",
            ).text
          }
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={submit}
          className="rounded-full"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {editingId
            ? i18n.resolve("host.v2.calendar.fixed_stays.save_stay", "Save stay")
                .text
            : i18n.resolve("host.v2.calendar.fixed_stays.add_stay", "Add stay")
                .text}
        </Button>
        {editingId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onDoneEditing}
            className="rounded-full"
          >
            {i18n.resolve("common.cancel", "Cancel").text}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One stay, with only the actions its state actually permits.
 *
 * A booked or already-started stay renders no buttons at all rather than disabled ones:
 * a control a host can see but never use is a question the panel keeps asking them. The
 * rule is the server's — `manageable` — so this cannot come to a different answer than
 * the transaction that would refuse the write.
 */
function PeriodRow({
  listingId,
  period,
  editing,
  onEdit,
}: {
  listingId: string;
  period: HostCalendarListing["fixedStayPeriods"][number];
  editing: boolean;
  onEdit: () => void;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const disabled = period.state === "DISABLED";

  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        day: "numeric",
        month: "short",
      }),
    [i18n.locale],
  );

  const stateLabel = {
    PAST: i18n.resolve("host.v2.calendar.fixed_stays.state_past", "Past"),
    DISABLED: i18n.resolve("host.v2.calendar.fixed_stays.state_off", "Switched off"),
    BOOKED: i18n.resolve("host.v2.calendar.fixed_stays.state_booked", "Booked"),
    DATES_TAKEN: i18n.resolve(
      "host.v2.calendar.fixed_stays.state_taken",
      "Dates taken",
    ),
    AVAILABLE: i18n.resolve(
      "host.v2.calendar.fixed_stays.state_available",
      "Offered",
    ),
  }[period.state];

  function run(action: () => Promise<{ error?: string } | unknown>) {
    start(async () => {
      const result = (await action()) as { error?: string } | undefined;
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li
      data-fixed-stay-row={period.id}
      data-state={period.state}
      data-manageable={period.manageable ? "true" : "false"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-2",
        editing ? "bg-slate-100" : "hover:bg-slate-50",
      )}
    >
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[0.8125rem] font-medium notranslate",
            period.manageable ? "text-slate-900" : "text-slate-500",
          )}
          translate="no"
        >
          {dayFormatter.format(new Date(`${period.checkIn}T00:00:00Z`))}
          {" → "}
          {dayFormatter.format(new Date(`${period.checkOut}T00:00:00Z`))}
        </span>
        <span className="mt-0.5 block text-[0.75rem] text-slate-500">
          <span className="notranslate" translate="no">
            {
              i18n.plural(
                "host.v2.calendar.fixed_stays.nights",
                period.nights,
                "{n} night",
                "{n} nights",
              ).text
            }
          </span>
          {" · "}
          {stateLabel.text}
        </span>
      </span>

      {/* Nothing at all for a booked or past stay — see the note on this component. */}
      {period.manageable ? (
        <span className="flex shrink-0 items-center gap-1">
          {confirmingRemove ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(() => deleteFixedStayPeriod(listingId, period.id))
                }
                className="rounded-full"
              >
                {i18n.resolve(
                  "host.v2.calendar.fixed_stays.confirm_remove",
                  "Remove stay",
                ).text}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirmingRemove(false)}
                className="rounded-full"
              >
                {i18n.resolve("common.cancel", "Cancel").text}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={onEdit}
                className="rounded-full"
              >
                {i18n.resolve("host.v2.calendar.fixed_stays.edit", "Edit").text}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setFixedStayPeriodEnabled(listingId, period.id, disabled),
                  )
                }
                className="rounded-full"
              >
                {disabled
                  ? i18n.resolve(
                      "host.v2.calendar.fixed_stays.enable",
                      "Turn on",
                    ).text
                  : i18n.resolve(
                      "host.v2.calendar.fixed_stays.disable",
                      "Turn off",
                    ).text}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirmingRemove(true)}
                className="rounded-full"
              >
                {i18n.resolve("host.v2.calendar.fixed_stays.remove", "Remove").text}
              </Button>
            </>
          )}
        </span>
      ) : null}
    </li>
  );
}
