"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  beginSave,
  endSave,
  useSaveState,
} from "@/components/host/v2/editor/save-state";
import { HouseRulesRows } from "@/components/host/v2/house-rules/house-rules-rows";
import { updateListingHouseRules } from "@/lib/actions/listing-house-rules.actions";
import {
  conflictsWithBookedParty,
  listingHouseRulesIssues,
  sameListingHouseRules,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";

/** Long enough that holding the guest stepper is one save, short enough that a host who
 *  changes one thing and closes the tab still sees "Saved" before they go. */
const AUTOSAVE_DELAY_MS = 700;

/**
 * The House rules workspace.
 *
 * The screen is `HouseRulesRows`, the same component the create flow renders, so a host
 * who set their rules while publishing meets exactly the control they already used. What
 * lives here is the editor's half of the arrangement: an autosave, and the recovery when
 * the server refuses one.
 *
 * No save button. The header and the line under the rows report the state, and a debounce
 * decides when. Local state is authoritative while the host works, and the server's answer
 * is the tiebreaker — a refused write snaps the rows back to the last values the server
 * confirmed and says why, because a control left showing a change that was never stored is
 * the one failure a host would never notice.
 *
 * Unanswered policies are *not* required here, deliberately. Every listing published
 * before these columns existed has four of them, and a page that refused to save until
 * its host answered questions they were never asked would make the rest of the section
 * uneditable. The create flow requires them; this reports them as blanks the host may
 * fill in whenever they like.
 */
export function HouseRulesWorkspace({
  listingId,
  rules: initialRules,
  largestUpcomingParty,
}: {
  listingId: string;
  rules: ListingHouseRulesInput;
  largestUpcomingParty: number;
}) {
  const i18n = useI18n();
  const { resolve } = i18n;
  const saveState = useSaveState();

  const initial = useMemo<ListingHouseRulesInput>(() => initialRules, [initialRules]);

  const [rules, setRules] = useState<ListingHouseRulesInput>(initial);
  /** The last values the server confirmed — what an unsuccessful save reverts to. */
  const confirmed = useRef<ListingHouseRulesInput>(initial);
  const queued = useRef<ListingHouseRulesInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    // Only one write may be in flight. If two race, the slower older payload can
    // otherwise become the final database state.
    if (saving.current) return;
    const next = queued.current;
    if (!next || sameListingHouseRules(next, confirmed.current)) {
      queued.current = null;
      return;
    }

    queued.current = null;
    saving.current = true;
    beginSave();
    try {
      const result = await updateListingHouseRules(listingId, next);
      if (result.error || result.issues) {
        endSave(true);
        if (!mounted.current) return;
        toast.error(
          result.error ??
            resolve(
              "host.editor.house_rules.save_rejected",
              "Those house rules couldn't be saved. Your listing still shows the previous ones.",
            ).text,
        );
        // Only roll back if nothing newer is already on its way; otherwise the revert
        // would undo a change the host made while this request was in flight.
        if (queued.current === null) setRules(confirmed.current);
        return;
      }
      confirmed.current = result.rules ?? next;
      endSave();
    } catch {
      endSave(true);
      if (mounted.current) {
        toast.error(
          resolve(
            "host.editor.house_rules.save_failed",
            "We couldn't save that. Check your connection and try again.",
          ).text,
        );
        if (queued.current === null) setRules(confirmed.current);
      }
    } finally {
      saving.current = false;
      if (queued.current && !sameListingHouseRules(queued.current, confirmed.current)) {
        void flushRef.current();
      }
    }
  }, [listingId, resolve]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const change = useCallback((next: ListingHouseRulesInput, immediate: boolean) => {
    setRules(next);
    queued.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (immediate) {
      timer.current = null;
      void flushRef.current();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      void flushRef.current();
    }, AUTOSAVE_DELAY_MS);
  }, []);

  // Navigating to another editor section must not drop a change that is still inside
  // the debounce window.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void flushRef.current();
    };
  }, []);

  const issues = listingHouseRulesIssues(rules);
  const partyWarning = conflictsWithBookedParty(rules.maxGuests, largestUpcomingParty);

  return (
    <div>
      {/* Named by the rail, the browser tab and the active chip on a phone. The rows
          carry their own visible heading; this keeps the outline honest for screen
          readers, which have no rail to read. */}
      <p className="text-sm leading-6 text-slate-600">
        <Tx
          k="host.editor.house_rules.intro"
          source="What guests agree to when they book. Everything here appears on your listing page before a guest sends a request."
        />
      </p>

      <HouseRulesRows
        idPrefix="house-rules"
        rules={rules}
        issues={issues}
        onChange={change}
        guestFooter={
          partyWarning ? (
            <p
              role="status"
              className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {
                  interpolate(
                    resolve(
                      "host.editor.house_rules.party_warning",
                      "You already have an upcoming request or stay for {party} guests. Lowering the limit does not cancel it — it only stops new requests above {max}.",
                    ),
                    { party: largestUpcomingParty, max: rules.maxGuests },
                  ).text
                }
              </span>
            </p>
          ) : null
        }
      />

      {/* The header carries the same indicator, but it drops to an icon on a phone.
          Repeating it beside the controls keeps the answer to "did that save?" in the
          place the host is already looking, at every width. */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "mt-8 flex items-center gap-1.5 text-xs",
          saveState === "error" ? "text-rose-600" : "text-slate-500",
        )}
      >
        {saveState === "error" ? (
          <>
            <CircleAlert className="size-3.5" aria-hidden />
            <Tx
              k="host.editor.house_rules.status_error"
              source="Not saved — your listing still shows the previous rules."
            />
          </>
        ) : saveState === "saving" ? (
          <Tx k="host.editor.house_rules.status_saving" source="Saving…" />
        ) : saveState === "saved" ? (
          <Tx k="host.editor.house_rules.status_saved" source="Saved" />
        ) : (
          <Tx
            k="host.editor.house_rules.status_idle"
            source="Changes save on their own."
          />
        )}
      </p>
    </div>
  );
}
