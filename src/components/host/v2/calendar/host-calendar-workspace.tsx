"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  House,
  Lock,
  Percent,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import { useRailPreference } from "@/components/host/v2/entity-rail";
import {
  buildListingCalendarIndex,
  countDates,
  initialCalendarListingId,
} from "@/lib/host/v2/calendar-model";
import { summarizeListingStatus } from "@/lib/host/v2/listing-status";
import type { HostCalendarWorkspaceData } from "@/lib/host/v2/calendar-types";
import {
  extendSelection,
  selectDate,
  selectRange,
  toggleDate,
  selectionAfterListingSwitch,
  selectionDates,
  selectionNights,
  selectionRange,
  type CalendarSelection,
  type SelectionResult,
} from "@/lib/host/v2/calendar-selection";
import {
  buildAvailabilityAction,
  datesFor,
  stepsForDates,
  undoStepsForDates,
  type AvailabilityDirection,
} from "@/lib/host/v2/calendar-availability-action";
import {
  stepsForBasePrice,
  stepsForPrice,
  undoStepsForPrices,
} from "@/lib/host/v2/calendar-price-action";
import type { ProposedPromotion } from "@/lib/host/v2/calendar-quote";
import type { MutationStep } from "@/lib/host/v2/calendar-review";
import {
  buildDateReviewPlan,
  type DateChange,
  type ReviewPlan,
} from "@/lib/host/v2/calendar-review";
import {
  backFrom,
  leavingLosesWork,
  CONNECTIONS_VIEW,
  MENU_VIEW,
  openEditor as openWorkbenchEditor,
  scopeOfSelection,
  viewAfterScopeChange,
  type WorkbenchEditor,
  type WorkbenchView,
} from "@/lib/host/v2/calendar-workbench";
import type {
  CalendarHrefRange,
  CalendarIntent,
} from "@/lib/host/v2/calendar-href";
import {
  calendarArrival,
  EDITOR_FOR_INTENT,
  viewForPendingIntent,
} from "@/lib/host/v2/calendar-intent";
import { editorSectionHref } from "@/lib/host/v2/editor-sections";
import type { ScheduledChange } from "@/lib/host/v2/calendar-schedule";
import { formatMonthYear, formatShortDate } from "@/lib/host/v2/calendar-format";
import {
  clampMonth,
  monthOf,
  monthsInWindow,
  shiftMonth,
} from "@/lib/host/v2/calendar-months";
import { addDaysToYmd, compareYmd } from "@/lib/utils/date-only";
import {
  CalendarMonthStream,
  scrollStreamToMonth,
} from "./calendar-month-stream";
import { ALL_LISTINGS, ListingChooserSheet, ListingRail } from "./listing-rail";
import { ManageCalendarPanel } from "./manage-calendar-panel";
import type { DateActionResult } from "./date-editors";
import { AllListingsTimeline } from "./all-listings-timeline";
import { ReviewDialog } from "./review-dialog";
import { runMutationSteps } from "./calendar-actions";
import { ChannelChip } from "./channel-chip";
import {
  bookabilityLine,
  money,
  workbenchEditorLabel,
} from "./calendar-labels";

const RAIL_PREFERENCE_KEY = "bookeasy.host.v2.calendar.rail";

/**
 * A review is only ever about the selected dates now.
 *
 * It used to carry a listing-wide branch as well, with the staged change attached,
 * because this screen edited the listing's defaults too. Those moved to the listing
 * editor, and with them the second shape this had to hold.
 */
type ReviewTarget = { kind: "date" } | null;

export function HostCalendarWorkspace({
  data,
  requestedListingId = null,
  intent = null,
  requestedRange = null,
}: {
  data: HostCalendarWorkspaceData;
  /**
   * The property to open on, from `?listing=` — how the listings page hands one over.
   *
   * Honoured only when the payload actually contains it. The payload is scoped to this
   * host, so an id from someone else's listing, or one deleted since the link was made,
   * resolves to nothing and the default property is shown instead of an empty calendar.
   */
  requestedListingId?: string | null;
  /**
   * Why the host came, from `?intent=`.
   *
   * The listing editor's contextual links are half a sentence — "set prices for
   * specific dates" — and this is the other half arriving with them. It puts the
   * calendar into a state that asks for dates, and opens the matching editor as soon
   * as the first selection is made. It is never a permission: it names an editor that
   * only ever acts on selected dates, and it is dropped the moment the host does
   * anything else.
   */
  intent?: CalendarIntent | null;
  /** Dates the link already knew about — a dated offer's own range. Inclusive. */
  requestedRange?: CalendarHrefRange | null;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * Everything the link asked for, resolved once.
   *
   * Computed in one lazy initializer rather than three, because the selection, the open
   * destination and whether an intent is still waiting are one decision — deriving them
   * separately is how they drift apart.
   */
  const [arrival] = useState(() => {
    const listingId = initialCalendarListingId(data, requestedListingId);
    // `initialCalendarListingId` intentionally falls back to the host's first listing
    // when a requested id is stale or belongs to somebody else. That is useful for
    // rendering the calendar, but it must not retarget the requested edit/range to a
    // different property. Only honour deep-link context when its exact listing was
    // present in the host-scoped payload.
    const requestedListingMatched =
      requestedListingId !== null &&
      data.listings.some((listing) => listing.id === requestedListingId);
    return {
      listingId,
      ...calendarArrival({
        intent,
        range: requestedRange,
        hasListing: requestedListingMatched,
        today: data.today,
        horizonEnd: data.horizonEnd,
      }),
    };
  });

  const [selectedId, setSelectedId] = useState<string>(
    () => arrival.listingId ?? ALL_LISTINGS,
  );
  const [selection, setSelection] = useState<CalendarSelection | null>(
    arrival.selection,
  );
  const [promotionEditorId, setPromotionEditorId] = useState<string | null>(null);
  /** The month the stream is showing. Reported by scrolling, not by paging. */
  const [month, setMonth] = useState(() => monthOf(data.today));
  const [focusedDate, setFocusedDate] = useState(data.today);
  const streamRef = useRef<HTMLDivElement>(null);
  const manageDrawerRef = useRef<HTMLElement>(null);
  // Collapsed by default on the overview: that view is itself a list of every
  // property, so an expanded rail states each title, photo and bookability line a
  // second time. An explicit toggle still wins — see `useRailPreference`.
  const [railCompact, setRailCompact] = useRailPreference(
    RAIL_PREFERENCE_KEY,
    selectedId === ALL_LISTINGS,
  );
  const [chooserOpen, setChooserOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [change, setChange] = useState<DateChange | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>(null);
  /**
   * The direct change that just landed, and the steps that would take it back.
   *
   * Availability and price both write without a review, so this is what stands in for
   * the review dialog's confirmation: a line in the panel saying what happened, next to
   * the one control that reverses it.
   */
  const [dateAction, setDateAction] = useState<{
    /** The property, range and editor it was performed in. See `actionScope`. */
    scope: string;
    result: DateActionResult;
    undoSteps: MutationStep[];
  } | null>(null);
  /**
   * Where the editing panel is: its summary menu, one focused editor, or the
   * scheduled-changes list. Exactly one of the three, always.
   */
  const [view, setView] = useState<WorkbenchView>(arrival.view);
  /**
   * The action the host arrived to perform, until they perform it or drop it.
   *
   * Held in state rather than read straight from the prop, so that cancelling it — or
   * simply choosing a different editor — actually ends it. An intent that came back on
   * every render would keep re-opening its editor over whatever the host did next.
   */
  const [pendingIntentAction, setPendingIntentAction] =
    useState<CalendarIntent | null>(arrival.pendingIntent);
  /** The move the host asked for, held while they answer the discard prompt. */
  const [pendingIntent, setPendingIntent] = useState<{ run: () => void } | null>(
    null,
  );
  /** A review is open, or its save is already in flight. Read by Escape. */
  const reviewBusy = reviewTarget !== null || pending;

  // The editor itself is one persistent tree. At compact widths CSS turns that tree
  // into a full-height drawer; at desktop widths it sits in the right column. Closing
  // the drawer on a breakpoint change prevents mobile-only modal semantics from
  // leaking onto the desktop pane without branching the rendered component tree.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerOnDesktop = () => {
      if (desktop.matches) setSheetOpen(false);
    };
    closeDrawerOnDesktop();
    desktop.addEventListener("change", closeDrawerOnDesktop);
    return () => desktop.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const drawer = manageDrawerRef.current;
    if (!drawer) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const frame = window.requestAnimationFrame(() => {
      const first = drawer.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      // A review/discard dialog is portalled above this drawer and owns focus while
      // open. Let that topmost modal handle its own Escape and Tab keys.
      if (!drawer.contains(document.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setSheetOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter(
        (element) =>
          element.offsetParent !== null && element.closest("[inert]") === null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [sheetOpen]);

  const entries = useMemo(
    () =>
      data.listings.map((listing) => {
        const index = buildListingCalendarIndex(listing);
        const counts = countDates(listing, index, data.today, data.horizonEnd);
        return {
          listing,
          index,
          summary: summarizeListingStatus({
            listing,
            counts,
            horizonMonths: data.horizonMonths,
          }),
        };
      }),
    [data],
  );

  const active = useMemo(
    () => entries.find((entry) => entry.listing.id === selectedId) ?? null,
    [entries, selectedId],
  );
  const allDatePromotionCount =
    active?.listing.promotions.filter(
      (promotion) => !promotion.startDate && !promotion.endDate,
    ).length ?? 0;
  const months = useMemo(
    () => monthsInWindow(data.today, data.horizonEnd),
    [data.today, data.horizonEnd],
  );
  const minMonth = months[0];
  const maxMonth = months[months.length - 1];

  /** Jump the stream to a month, and adopt it as the header's label immediately. */
  const goToMonth = useCallback(
    (target: string) => {
      const next = clampMonth(target, months);
      setMonth(next);
      scrollStreamToMonth(streamRef.current, next);
    },
    [months],
  );

  /**
   * Anything the host has typed or chosen but not yet reviewed.
   *
   * Mirrored into a ref because the guard below is handed to memoized month grids and
   * has to keep a stable identity; the ref is written from an effect, which has always
   * flushed before the next click can read it.
   */
  const hasDraft = change !== null;
  const hasDraftRef = useRef(hasDraft);
  useEffect(() => {
    hasDraftRef.current = hasDraft;
  }, [hasDraft]);

  /**
   * A result describes one act, on one range, of one property, in one editor.
   *
   * Moving any of those makes it stale — most importantly for Undo, whose steps still
   * name the old range. It is read through the scope rather than cleared by an effect,
   * so a result belonging to dates the host has left cannot be rendered even once.
   */
  const actionScope = `${selectedId}:${selection?.start ?? ""}:${
    selection?.end ?? ""
  }:${view.kind === "editor" ? view.editor : view.kind}`;
  const liveDateAction =
    dateAction?.scope === actionScope ? dateAction : null;

  const discardDraft = useCallback(() => {
    setChange(null);
  }, []);

  /**
   * Run a move that would throw away an unsaved edit, or hold it until the host says
   * it is fine to. Everything that changes what the panel is editing — the dates, the
   * property, which card is open — goes through here.
   */
  const guard = useCallback((run: () => void) => {
    if (!hasDraftRef.current) {
      run();
      return;
    }
    setPendingIntent({ run });
  }, []);

  const selectListing = useCallback(
    (id: string) => {
      if (id === selectedId) {
        setChooserOpen(false);
        return;
      }
      guard(() => {
        setSelection((current) =>
          selectionAfterListingSwitch(current, selectedId, id),
        );
        anchorRef.current = null;
        setChange(null);
        setPromotionEditorId(null);
        setReviewTarget(null);
        // An intent is scoped to the listing named by the deep link. Carrying it to a
        // different property would silently turn "price dates for A" into "price
        // dates for B" after the next selection.
        setPendingIntentAction(null);
        // A different property means different dates, different prices and different
        // offers. Whatever editor was open was about the old one, so the panel goes
        // back to its menu rather than re-pointing an editor at a stranger.
        setView(MENU_VIEW);
        setSelectedId(id);
      });
    },
    [selectedId, guard],
  );

  const clearSelection = useCallback(() => {
    // Escape reaches here from the grid. A review that is open — or a save already in
    // flight — is a decision the host is in the middle of making about these exact
    // dates, so clearing them out from underneath it is refused rather than queued.
    // Identity changes only when a review opens or closes, which re-renders anyway.
    if (reviewBusy) return;
    guard(() => {
      setSelection(null);
      anchorRef.current = null;
      setChange(null);
      setPromotionEditorId(null);
    });
  }, [guard, reviewBusy]);

  const openSchedule = useCallback(() => {
    guard(() => {
      setChange(null);
      setView({ kind: "schedule" });
    });
  }, [guard]);

  /** Connected calendars, in this panel. Guarded like any other departure from an
   *  editor, so a half-typed price is not lost to a detour into sync. */
  const openConnections = useCallback(() => {
    guard(() => {
      setChange(null);
      setView(CONNECTIONS_VIEW);
    });
  }, [guard]);

  /**
   * The live selection, mirrored so the click handler below can stay referentially
   * stable. Every month of the horizon is mounted at once and memoized on its props; a
   * handler that changed identity on each selection would re-render all eighteen of
   * them for a click that only ever touches one or two.
   */
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  /**
   * Selecting dates, or clearing them, changes what an open editor would act on.
   *
   * Reconciled during render rather than synced back into state by an effect: the
   * stored view is what the host last asked for, and this is what that request means
   * under the current selection. An editor still in scope stays open — extending the
   * range by a day should not make the host retype a price — while one that no longer
   * belongs falls back to the menu, so a listing-wide editor can never sit above a
   * date selection it knows nothing about. Nothing reads `view` directly after this.
   */
  const scope = scopeOfSelection(selection);
  const activeView = viewAfterScopeChange(view, scope);

  /** Open a focused editor. Guarded, so an unreviewed draft is never lost silently. */
  const openEditor = useCallback(
    (editor: WorkbenchEditor) => {
      const next = openWorkbenchEditor(editor, scope);
      // An out-of-scope request is refused rather than pointed at the wrong target.
      if (!next) return;
      guard(() => {
        // Choosing an editor by hand answers the question the intent was asking, so
        // the intent stops applying whichever editor was chosen.
        setPendingIntentAction(null);
        setPromotionEditorId(null);
        setView(next);
      });
    },
    [guard, scope],
  );

  /** Back always means the summary menu — there is only ever one level to climb. */
  const backToMenu = useCallback(() => {
    const leave = () => {
      // Backing out of the editor an intent opened is how the host declines it. The
      // intent is dropped rather than re-applied on the next selection, so "no, not
      // that" is answered once.
      setPendingIntentAction(null);
      setView(backFrom(activeView));
    };
    // Only an editor can be holding a draft; backing out of the schedule list or the
    // menu has nothing to lose and must never raise the prompt.
    if (leavingLosesWork(activeView, hasDraftRef.current)) {
      setPendingIntent({ run: leave });
      return;
    }
    leave();
  }, [activeView]);

  /**
   * The end of the run the host planted, which Shift-arrow grows from.
   *
   * A ref rather than state: nothing renders from it, and it has to be readable by the
   * referentially stable handlers the memoized month grids depend on.
   */
  const anchorRef = useRef<string | null>(null);

  /** One place where a selection result becomes state, refusals included. */
  const applySelection = useCallback(
    (result: SelectionResult) => {
      if (result.rejected === "past") {
        // A refusal is not a scope change, so it is reported straight away rather
        // than behind a prompt about discarding work the click never threatened.
        toast.error(
          i18n.resolve(
            "host.v2.calendar.past_rejected",
            "Past dates cannot be changed.",
          ).text,
        );
        return;
      }
      guard(() => {
        setSelection(result.selection);
        anchorRef.current = result.anchor;
        // A new question about different dates should not inherit half an answer.
        setChange(null);
        setPromotionEditorId(null);
        // The host followed a link that named an action and then picked the dates it
        // was missing. Opening that editor here is answering them, not guessing: the
        // intent is consumed at the same moment, so a later selection behaves normally.
        const intentView = viewForPendingIntent(
          pendingIntentAction,
          result.selection,
        );
        if (intentView) {
          setPendingIntentAction(null);
          setView(intentView);
        }
      });
    },
    [i18n, guard, pendingIntentAction],
  );

  const handleSelectDate = useCallback(
    (date: string, extend: boolean, toggle: boolean) => {
      const current = selectionRef.current;
      applySelection(
        toggle
          ? toggleDate(current, date, data.today)
          : extend
          ? extendSelection(current, date, data.today, anchorRef.current)
          : selectDate(current, date, data.today),
      );
    },
    [data.today, applySelection],
  );

  /**
   * Shift-arrow. `from` is the date focus was on, which becomes the anchor when there
   * was no selection yet — so the first Shift-arrow selects both the date the host was
   * standing on and the one they moved to, rather than only the latter.
   */
  const handleExtendSelection = useCallback(
    (from: string, to: string) => {
      const current = selectionRef.current;
      const anchor = current ? (anchorRef.current ?? current.start) : from;
      applySelection(extendSelection(current, to, data.today, anchor));
    },
    [data.today, applySelection],
  );

  /**
   * Open a row from the scheduled-changes list.
   *
   * Selecting its dates first is what makes the editor it opens the right one: the
   * pricing editor for a custom-price run, the promotion editor for a dated offer, and
   * the availability editor for a block — including a protected one, where it is the
   * editor that explains the dates are not this panel's to change.
   */
  const openScheduledEntry = useCallback(
    (entry: ScheduledChange) => {
      guard(() => {
        setChange(null);
        setSelection(entry.target.selection);
        anchorRef.current = entry.target.selection.start;
        setPromotionEditorId(entry.promotion?.id ?? null);
        setView({ kind: "editor", editor: entry.target.editor });
      });
    },
    [guard],
  );

  /** Same, with the removal already armed so Review names what it will end. */
  const removeScheduledPromotion = useCallback(
    (entry: ScheduledChange) => {
      if (!entry.promotion) return;
      const promotionId = entry.promotion.id;
      guard(() => {
        setSelection(entry.target.selection);
        anchorRef.current = entry.target.selection.start;
        setChange({ kind: "PROMOTION_REMOVE", promotionId });
        setPromotionEditorId(promotionId);
        setView({ kind: "editor", editor: "promotions" });
      });
    },
    [guard],
  );

  /**
   * Open a promotion where it is actually edited.
   *
   * A dated offer belongs to its nights, so it opens here: the calendar selects that
   * exact range and puts the promotion editor on it. An always-active one belongs to
   * the listing, so this leaves for the Pricing section rather than growing a second
   * editor for it — the whole reason the ongoing offers moved there is that "every
   * date, forever" is not a thing a date grid can meaningfully show.
   */
  const openPromotion = useCallback(
    (promotion: HostCalendarWorkspaceData["listings"][number]["promotions"][number]) => {
      guard(() => {
        if (!promotion.startDate || !promotion.endDate) {
          if (active) router.push(editorSectionHref(active.listing.id, "pricing"));
          return;
        }
        const nextSelection = {
          start: promotion.startDate!,
          end: addDaysToYmd(promotion.endDate!, -1),
        };
        setChange(null);
        setPromotionEditorId(promotion.id);
        setSelection(nextSelection);
        anchorRef.current = nextSelection.start;
        setView({ kind: "editor", editor: "promotions" });
      });
    },
    [guard, active, router],
  );

  /** A completed pointer drag. Committed once, on release, never during the gesture. */
  const handleSelectRange = useCallback(
    (range: CalendarSelection, anchor: string) => {
      const other = anchor === range.start ? range.end : range.start;
      applySelection(selectRange(anchor, other, data.today));
      // Deliberately does not open the drawer. Selecting dates and acting on them are
      // two decisions, and on a phone the drawer covers the calendar the host has just
      // picked from — often the moment they want to look at what is around it. The bar
      // renames itself to those dates instead, and opening stays one tap either way.
    },
    [data.today, applySelection],
  );

  const handleFocusDate = useCallback((date: string) => {
    setFocusedDate(date);
  }, []);

  const rangeLabel = useMemo(() => {
    if (!selection) return "";
    const from = formatShortDate(selection.start, data.formats);
    if (selection.start === selection.end) return from;
    return `${from} – ${formatShortDate(selection.end, data.formats)}`;
  }, [selection, data.formats]);

  const plan: ReviewPlan | null = useMemo(() => {
    if (!reviewTarget || !active) return null;
    return buildDateReviewPlan({
      listing: active.listing,
      index: active.index,
      selection,
      change,
      today: data.today,
    });
  }, [reviewTarget, active, selection, change, data]);

  /**
   * Write a direct change and remember how to take it back.
   *
   * Shared by availability and price because the shape is identical and the error
   * handling must be: on a failure nothing on screen is cleared and no result is
   * recorded, so the host is looking at exactly what they were looking at before, with
   * a toast saying it did not land.
   */
  const runDirectAction = useCallback(
    ({
      steps,
      undoSteps,
      result,
    }: {
      steps: MutationStep[];
      undoSteps: MutationStep[];
      result: DateActionResult;
    }) => {
      if (!active || steps.length === 0) return;
      const listingId = active.listing.id;
      const scope = actionScope;
      startTransition(async () => {
        let outcome: Awaited<ReturnType<typeof runMutationSteps>>;
        try {
          outcome = await runMutationSteps(listingId, steps);
        } catch {
          toast.error(
            i18n.resolve(
              "host.v2.calendar.save_failed",
              "Your change could not be saved. Nothing on this screen was cleared; try again.",
            ).text,
          );
          return;
        }
        if (outcome.error) {
          toast.error(outcome.error);
          return;
        }
        setDateAction({ scope, result, undoSteps });
        // The selection stays put on purpose: a host who just blocked four nights is
        // very often about to price them, and taking their dates away would undo that.
        router.refresh();
      });
    },
    [active, actionScope, i18n, router],
  );

  /**
   * Block or open the selected dates, there and then.
   *
   * No review, because the act is visible on the calendar the moment it lands and the
   * result line offers its exact inverse. What the review used to guarantee is kept:
   * the steps are built from the dates that can really move, so a night held by a
   * reservation or a connected calendar is never inside a range this sends.
   */
  const applyAvailability = useCallback(
    (direction: AvailabilityDirection, note: string | null) => {
      if (!active || !selection) return;
      const model = buildAvailabilityAction({
        listing: active.listing,
        index: active.index,
        dates: selectionDates(selection),
        today: data.today,
      });
      const targets = datesFor(model, direction);
      if (targets.length === 0) return;
      runDirectAction({
        steps: stepsForDates(targets, direction, note),
        undoSteps: undoStepsForDates(targets, direction),
        result: {
          kind: "AVAILABILITY",
          direction,
          dates: targets.length,
          undoable: true,
        },
      });
    },
    [active, selection, data.today, runDirectAction],
  );

  /**
   * Price the selected dates, or put them back on the base price.
   *
   * The undo is built before the write, from what each date costs right now — a
   * selection can span nights that each had their own amount and nights that had none,
   * and only the pre-edit index still knows which was which.
   */
  const applyPrice = useCallback(
    (nightlyRate: number | null) => {
      if (!active || !selection || !active.listing.pricing) return;
      const dates = selectionDates(selection);
      if (dates.length === 0) return;
      runDirectAction({
        steps:
          nightlyRate === null
            ? stepsForBasePrice(dates)
            : stepsForPrice(dates, nightlyRate),
        undoSteps: undoStepsForPrices(active.index, dates),
        result: {
          kind: "PRICE",
          dates: dates.length,
          amount:
            nightlyRate === null
              ? null
              : money(
                  nightlyRate,
                  active.listing.pricing.currency,
                  data.formats,
                ),
          undoable: true,
        },
      });
    },
    [active, selection, data.formats, runDirectAction],
  );

  /**
   * Start or update an offer on the selected dates, there and then.
   *
   * Undo is offered only when an existing offer was overwritten, because that is the
   * only case with something to put back: the save actions report success without the
   * id they created, so a brand-new offer has nothing an inverse step could name. The
   * host removes that one through the editor, where it now appears as saved.
   */
  const applyPromotion = useCallback(
    (offer: ProposedPromotion) => {
      if (!active || !selection) return;
      const { startDate, endDate } = selectionRange(selection);
      const previous = offer.promotionId
        ? active.listing.promotions.find(
            (promotion) => promotion.id === offer.promotionId,
          )
        : undefined;

      runDirectAction({
        steps: [
          {
            type: "SAVE_PROMOTION",
            startDate,
            endDate,
            promotionId: offer.promotionId,
            discountPercent: offer.discountPercent,
            minimumNights: offer.minimumNights,
            freeCleaning: offer.freeCleaning,
            roundToWholeUnit: offer.roundToWholeUnit,
          },
        ],
        undoSteps: previous
          ? [
              {
                type: "SAVE_PROMOTION",
                // The offer's own dates, not the selection: an edit reached from a
                // range that merely matches it must not move where it runs.
                startDate: previous.startDate ?? startDate,
                endDate: previous.endDate ?? endDate,
                promotionId: previous.id,
                discountPercent: previous.discountPercent,
                minimumNights: previous.minimumNights ?? 1,
                freeCleaning: previous.freeCleaning,
                roundToWholeUnit: previous.roundToWholeUnit,
              },
            ]
          : [],
        result: {
          kind: "PROMOTION",
          dates: selectionNights(selection),
          discountPercent: offer.discountPercent,
          edited: Boolean(previous),
          undoable: Boolean(previous),
        },
      });
    },
    [active, selection, runDirectAction],
  );

  const undoDateAction = useCallback(() => {
    const pendingUndo = liveDateAction;
    if (!pendingUndo || !active || !pendingUndo.result.undoable) return;
    const listingId = active.listing.id;
    startTransition(async () => {
      let outcome: Awaited<ReturnType<typeof runMutationSteps>>;
      try {
        outcome = await runMutationSteps(listingId, pendingUndo.undoSteps);
      } catch {
        toast.error(
          i18n.resolve(
            "host.v2.calendar.save_failed",
            "Your change could not be saved. Nothing on this screen was cleared; try again.",
          ).text,
        );
        return;
      }
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      // Undoing an undo is not offered: the second inverse would be the first action
      // again, which is what the controls above are already for.
      setDateAction(null);
      router.refresh();
    });
  }, [liveDateAction, active, i18n, router]);

  function confirmPlan() {
    if (!plan?.savable || !active) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof runMutationSteps>>;
      try {
        result = await runMutationSteps(active.listing.id, plan.steps);
      } catch {
        toast.error(
          i18n.resolve(
            "host.v2.calendar.save_failed",
            "Your change could not be saved. Nothing on this screen was cleared; try again.",
          ).text,
        );
        return;
      }
      // A failed write is still the host's unsaved draft. Keep the exact selection,
      // editor and review open so the error can be corrected or retried.
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setReviewTarget(null);
      setSheetOpen(false);
      // The change has landed, so the editor that described it has nothing left to
      // say. The panel returns to its menu showing the new state.
      setView(MENU_VIEW);
      // The draft has just become the saved state, so there is nothing left to
      // protect — clearing it directly rather than through `clearSelection` avoids
      // prompting the host to discard the change they only just confirmed.
      setSelection(null);
      anchorRef.current = null;
      discardDraft();
      router.refresh();
      toast.success(
        i18n.resolve("host.v2.calendar.saved", "Your change is live.").text,
      );
    });
  }

  if (entries.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        {/* The empty screen is still the Calendar page, so it still names itself. */}
        <h1 className="sr-only">
          {i18n.resolve("host.v2.calendar.heading", "Calendar").text}
        </h1>
        <House className="mx-auto size-6 text-slate-400" aria-hidden />
        <p className="mt-2 text-sm font-medium text-slate-700">
          {
            i18n.resolve(
              "host.v2.calendar.empty",
              "You have no properties to schedule yet.",
            ).text
          }
        </p>
      </section>
    );
  }

  const monthTitle = formatMonthYear(month, data.formats);
  const hasExternalBlocks =
    active?.listing.blocks.some((block) => block.blockType === "EXTERNAL_SYNC") ??
    false;

  /**
   * The whole right pane, in one place.
   *
   * It is inserted exactly once. CSS places that one mounted tree in the desktop right
   * column or turns it into the compact-width drawer, so local input state cannot split
   * between two copies. The safety explanation is no longer stacked above it — the
   * panel carries the short flag and the Availability card carries the sentence.
   */
  const managePanel = active ? (
    <ManageCalendarPanel
      key={active.listing.id}
      listing={active.listing}
      index={active.index}
      summary={active.summary}
      formats={data.formats}
      today={data.today}
      horizonEnd={data.horizonEnd}
      selection={selection}
      rangeLabel={rangeLabel}
      change={change}
      promotionEditorId={promotionEditorId}
      onChange={setChange}
      onClearSelection={clearSelection}
      onCloseDrawer={() => setSheetOpen(false)}
      onReviewDate={() => setReviewTarget({ kind: "date" })}
      actionPending={pending}
      actionResult={liveDateAction?.result ?? null}
      onApplyAvailability={applyAvailability}
      onApplyPrice={applyPrice}
      onApplyPromotion={applyPromotion}
      onUndoAction={undoDateAction}
      onDismissActionResult={() => setDateAction(null)}
      view={activeView}
      onOpenEditor={openEditor}
      onOpenSchedule={openSchedule}
      onBack={backToMenu}
      onOpenScheduledEntry={openScheduledEntry}
      onRemoveScheduledPromotion={removeScheduledPromotion}
      onSelectDatePromotion={openPromotion}
      onOpenConnections={openConnections}
      pendingIntent={pendingIntentAction}
      onCancelIntent={() => setPendingIntentAction(null)}
    />
  ) : null;

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.workspace)}
      className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:gap-2.5"
    >
      {/* The screen has no visible title — the header's underlined tab is the title, and
          repeating it would cost the first band of a workspace that needs every row. A
          screen reader has no equivalent of "look at the underlined tab", and without
          this the page's heading outline started at the month name. */}
      <h1 className="sr-only">
        {i18n.resolve("host.v2.calendar.heading", "Calendar").text}
      </h1>

      {/* Below `md` the rail is hidden, so the property — and its status — has to stay
          somewhere. This compact selector is that somewhere; it is also why the
          calendar pane itself no longer repeats the listing title on desktop. */}
      {active ? (
        <button
          type="button"
          onClick={() => setChooserOpen(true)}
          inert={sheetOpen ? true : undefined}
          aria-hidden={sheetOpen ? true : undefined}
          className="flex shrink-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left md:hidden"
        >
          {active.listing.photoUrl ? (
            <Image
              src={active.listing.photoUrl}
              alt={active.listing.photoAlt || active.listing.title}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"
            >
              <House className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-semibold text-slate-900">
              {active.listing.title}
            </span>
            <span
              className={cn(
                "mt-0.5 block truncate text-[0.6875rem]",
                active.summary.tone === "warning"
                  ? "text-amber-700"
                  : "text-slate-500",
              )}
            >
              {bookabilityLine(i18n, active.summary).text}
            </span>
          </span>
          <SlidersHorizontal className="size-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      ) : null}

      <div className="flex min-w-0 items-start gap-4 md:min-h-0 md:flex-1 md:items-stretch xl:gap-5">
        <div
          className="contents"
          inert={sheetOpen ? true : undefined}
          aria-hidden={sheetOpen ? true : undefined}
        >
          <ListingRail
            entries={entries}
            selectedId={selectedId}
            compact={railCompact}
            onSelect={selectListing}
            onToggleCompact={() => setRailCompact(!railCompact)}
          />
        </div>

        <div
          className="contents"
          inert={sheetOpen ? true : undefined}
          aria-hidden={sheetOpen ? true : undefined}
        >
          {active ? (
            <section className="flex min-w-0 flex-1 flex-col md:min-h-0">
            {/* No listing title here: the rail already says which property this is,
                and repeating it was the loudest thing on the screen. What is left is
                where in the horizon the host currently is, and how to move. */}
            <header
              {...anchorProps(CALENDAR_ANCHOR.monthControls)}
              className="sticky top-0 z-40 flex min-h-10 shrink-0 items-center gap-2 bg-white pb-2 md:static md:h-auto"
            >
              <button
                type="button"
                onClick={() => setChooserOpen(true)}
                aria-label={
                  interpolate(
                    i18n.resolve(
                      "host.v2.calendar.change_property",
                      "Change property: {property}",
                    ),
                    { property: active.listing.title },
                  ).text
                }
                className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] md:hidden"
              >
                {active.listing.photoUrl ? (
                  <Image
                    src={active.listing.photoUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="size-7 object-cover"
                  />
                ) : (
                  <House className="size-3.5" aria-hidden />
                )}
              </button>
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-slate-900">
                {monthTitle}
              </h2>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    goToMonth(monthOf(data.today));
                    setFocusedDate(data.today);
                  }}
                >
                  {i18n.resolve("host.v2.calendar.today", "Today").text}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={compareYmd(month, minMonth) <= 0}
                  onClick={() => goToMonth(shiftMonth(month, -1))}
                  aria-label={
                    i18n.resolve(
                      "host.v2.calendar.previous_month",
                      "Previous month",
                    ).text
                  }
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={compareYmd(month, maxMonth) >= 0}
                  onClick={() => goToMonth(shiftMonth(month, 1))}
                  aria-label={
                    i18n.resolve("host.v2.calendar.next_month", "Next month").text
                  }
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            </header>

            <CalendarMonthStream
              lead={
                <>
                  {/* An always-active offer is not something this grid can show —
                      it applies to every night, including the ones off screen — so the
                      banner reports it and leads to the Pricing section, which is the
                      one place it can be changed. It used to open a listing-wide
                      editor inside this panel, which is exactly the second home the
                      split removed. */}
                  {allDatePromotionCount > 0 ? (
                    <Link
                      href={editorSectionHref(active.listing.id, "pricing")}
                      className="mb-3 flex min-h-11 w-full shrink-0 items-center justify-between gap-4 rounded-xl bg-[#f8fafc] px-3.5 py-2.5 text-left text-[#0f172a] transition-colors hover:bg-[#f1f5f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Percent className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <span className="block text-[0.8125rem] font-semibold">
                            {interpolate(
                              i18n.plural(
                                "host.v2.calendar.all_date_promotions_count",
                                allDatePromotionCount,
                                "{n} all-date promotion active",
                                "{n} all-date promotions active",
                              ),
                              {},
                            ).text}
                          </span>
                          <span className="block truncate text-[0.6875rem] text-[#0f172a]">
                            {
                              i18n.resolve(
                                "host.v2.calendar.all_date_promotions_hint",
                                "Available when the guest meets the minimum stay",
                              ).text
                            }
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[0.75rem] font-semibold">
                        {i18n.resolve("host.v2.calendar.manage", "Manage").text}
                      </span>
                    </Link>
                  ) : null}
                </>
              }
              listing={active.listing}
              index={active.index}
              formats={data.formats}
              today={data.today}
              horizonEnd={data.horizonEnd}
              months={months}
              selection={selection}
              focusedDate={focusedDate}
              onFocusDate={handleFocusDate}
              onSelectDate={handleSelectDate}
              onExtendSelection={handleExtendSelection}
              onSelectRange={handleSelectRange}
              onClearSelection={clearSelection}
              onVisibleMonthChange={setMonth}
              scrollRef={streamRef}
            />

            <ul
              {...anchorProps(CALENDAR_ANCHOR.legend)}
              className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[0.6875rem] text-slate-500"
            >
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full bg-teal-500" />
                {i18n.resolve("host.v2.calendar.legend.available", "Available").text}
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 rounded-[3px] border border-[#e2e6ea] bg-[#e2e8f0]"
                />
                {i18n.resolve("host.v2.calendar.legend.selected", "Selected").text}
              </li>
              {/* One entry, not two. A booking taken here and a date a connected
                  calendar is holding are the same answer to the only question this grid
                  is scanned for — the night is gone — and the marks beside it say where
                  a stay came from. The chips are shown only where imported blocks
                  exist, so a host with no connections is not taught marks their grid
                  never draws. */}
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 rounded-[3px] border border-[#b5d4f4] bg-[#e6f1fb]"
                />
                {i18n.resolve("host.v2.calendar.legend.booked", "Booked").text}
                {hasExternalBlocks ? (
                  <span className="flex items-center gap-0.5">
                    <ChannelChip platform="AIRBNB" className="size-3" />
                    <ChannelChip platform="BOOKING" className="size-3" />
                    <ChannelChip platform="VRBO" className="size-3" />
                  </span>
                ) : null}
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="size-3 text-slate-400" aria-hidden />
                {i18n.resolve("host.v2.calendar.legend.blocked", "Blocked").text}
              </li>
              {/* Only a listing that starts closed has dates in this state, and on one
                  that starts open the key would explain a colour the grid never shows. */}
              {active.listing.availabilityMode === "CLOSED" ? (
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-[3px] border border-[#eef1f4] bg-[#fafbfc]"
                  />
                  {i18n.resolve("host.v2.calendar.legend.closed", "Closed").text}
                </li>
              ) : null}
            </ul>
            </section>
          ) : (
            <AllListingsTimeline
              entries={entries}
              today={data.today}
              formats={data.formats}
              onSelectListing={selectListing}
            />
          )}
        </div>

        {active ? (
          <aside
            ref={manageDrawerRef}
            {...anchorProps(CALENDAR_ANCHOR.workbench)}
            role={sheetOpen ? "dialog" : undefined}
            aria-modal={sheetOpen ? true : undefined}
            aria-labelledby={sheetOpen ? "host-v2-manage-drawer-title" : undefined}
            aria-label={
              sheetOpen
                ? undefined
                : i18n.resolve("host.v2.calendar.workbench", "Editing panel").text
            }
            className={cn(
              "hidden",
              sheetOpen &&
                "fixed inset-0 z-[45] flex h-dvh w-full flex-col bg-white",
              // Desktop: the exact same mounted tree becomes the fixed right pane.
              // `overflow-hidden` rather than `overflow-y-auto`: the panel owns its
              // own scrolling now, so its header and primary action stay put and only
              // the editor body moves — the same arrangement the drawer already had.
              "lg:static lg:inset-auto lg:z-auto lg:flex lg:h-auto lg:min-h-0 lg:w-[23rem] lg:shrink-0 lg:flex-col lg:overflow-hidden lg:border-l lg:border-slate-100 lg:bg-transparent lg:pl-4 xl:w-[25rem]",
            )}
          >
            {/* The panel is one flex column in both layouts: its own header and its
                own sticky action, with the body between them as the only scroller.
                It carries the safe-area inset the removed drawer bar used to absorb —
                its header is the topmost thing in the sheet now, so the notch is its
                problem. */}
            <div
              className="flex min-h-0 flex-1 flex-col px-4 pt-3 lg:px-0 lg:pt-0"
              style={
                sheetOpen
                  ? { paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }
                  : undefined
              }
            >
              {managePanel}
            </div>
          </aside>
        ) : null}
      </div>

      {/* One line below `lg`, and always an action.

          It used to be two lines that read "Choose dates to change availability or
          price" whenever nothing was selected — an instruction, permanently parked
          above the phone's own navigation, telling a host something they learn on
          their first tap. Now the label follows what there is to do: the listing-wide
          menu when no dates are chosen, those dates when some are.

          The bottom offset clears the phone's fixed navigation, which only exists
          below `md` — from `md` to `lg` the bar sat four rems above nothing. */}
      {active ? (
        <div
          inert={sheetOpen ? true : undefined}
          aria-hidden={sheetOpen ? true : undefined}
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex shrink-0 items-center rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur md:bottom-0 lg:hidden"
        >
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors duration-150 hover:bg-slate-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]"
          >
            <CalendarDays className="size-4 shrink-0 text-slate-400" aria-hidden />
            {/* Verb first in both states, so the bar reads as the one thing it is:
                a way in. The nights are last because they are the part a narrow
                screen can afford to truncate. */}
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-slate-900">
              {selection
                ? interpolate(
                    i18n.plural(
                      "host.v2.calendar.manage_selected_dates",
                      selectionNights(selection),
                      "Manage {range} · {n} night",
                      "Manage {range} · {n} nights",
                    ),
                    { range: rangeLabel },
                  ).text
                : pendingIntentAction
                  ? `${
                      i18n.resolve(
                        "host.v2.calendar.manage_all_dates",
                        "Manage dates",
                      ).text
                    } · ${workbenchEditorLabel(
                      i18n,
                      EDITOR_FOR_INTENT[pendingIntentAction],
                    ).text}`
                  : i18n.resolve(
                      "host.v2.calendar.manage_all_dates",
                      "Manage dates",
                    ).text}
            </span>
            <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
          </button>

          {/* Letting go of the dates without opening anything. Its own control rather
              than part of the row above: one target that opens and one that clears
              cannot be confused for each other, and a button inside a button is not a
              thing a browser will render. Desktop has this on the panel header, which
              a phone never sees while the drawer is shut. */}
          {selection ? (
            <>
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
              <button
                type="button"
                onClick={clearSelection}
                aria-label={
                  i18n.resolve(
                    "host.v2.calendar.clear_selection",
                    "Clear selection",
                  ).text
                }
                className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-600 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <ListingChooserSheet
        open={chooserOpen}
        entries={entries}
        selectedId={selectedId}
        onSelect={selectListing}
        onOpenChange={setChooserOpen}
      />

      {plan && active ? (
        <ReviewDialog
          open={reviewTarget !== null}
          plan={plan}
          scopeLabel={`${active.listing.title} · ${rangeLabel}`}
          currency={active.listing.pricing?.currency ?? BASE_CURRENCY}
          formats={data.formats}
          pending={pending}
          // Only a block carries a note. Everything else gets null and no field.
          note={
            change?.kind === "AVAILABILITY" && change.to === "BLOCK"
              ? (change.note ?? "")
              : null
          }
          onNoteChange={(note) =>
            setChange({ kind: "AVAILABILITY", to: "BLOCK", note })
          }
          onOpenChange={(open) => {
            // Keep the reviewed draft attached while its mutation is in flight. A
            // failed request must return to the same open, retryable review.
            if (!open && !pending) setReviewTarget(null);
          }}
          onConfirm={confirmPlan}
        />
      ) : null}

      {/* Unsaved work is never dropped silently. The prompt only appears when there
          is genuinely something to lose, and "keep editing" is the safe default the
          Escape key and the backdrop both fall back to. */}
      <Dialog
        open={pendingIntent !== null}
        onOpenChange={(open) => {
          if (!open) setPendingIntent(null);
        }}
      >
        <DialogContent variant="sheet" className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {
                i18n.resolve(
                  "host.v2.calendar.discard_title",
                  "Discard this unsaved change?",
                ).text
              }
            </DialogTitle>
          </DialogHeader>
          <p className="text-[0.8125rem] leading-5 text-slate-600">
            {
              i18n.resolve(
                "host.v2.calendar.discard_body",
                "You have an edit here that has not been reviewed or saved. Moving on will throw it away.",
              ).text
            }
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setPendingIntent(null)}
            >
              {
                i18n.resolve(
                  "host.v2.calendar.discard_keep",
                  "Keep editing",
                ).text
              }
            </Button>
            <Button
              type="button"
              size="lg"
              className="bg-[#0f172a] text-white hover:bg-[#1e293b]"
              onClick={() => {
                const intent = pendingIntent;
                setPendingIntent(null);
                discardDraft();
                intent?.run();
              }}
            >
              {
                i18n.resolve(
                  "host.v2.calendar.discard_confirm",
                  "Discard and continue",
                ).text
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
