"use client";

import { TriangleAlert } from "lucide-react";
import {
  ArrivalDetail,
  ArrivalFieldGroup,
  ArrivalSelect,
} from "@/components/host/v2/editor/arrival-guide/arrival-detail";
import { HouseRulesRows } from "@/components/host/v2/house-rules/house-rules-rows";
import {
  FLEXIBLE_STAY_TIME,
  conflictsWithBookedParty,
  listingHouseRulesIssues,
  stayTimeChoices,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import { flexibleTimeLabel } from "@/lib/i18n/house-rules-labels";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * The two cards that do not own their own storage.
 *
 * Both edit `Listing` columns whose single writer is `updateListingHouseRules`. That is
 * deliberate and it is the reason these are in a file of their own: the Arrival guide
 * *shows* the stay times because they are the first thing a guest needs on arrival, but it
 * must not become a second owner of them. It renders the same controls the House rules
 * section renders and calls the same action, so the two screens cannot disagree about what
 * a listing says.
 */
export interface StayEditorProps {
  rules: ListingHouseRulesInput;
  onChange: (next: ListingHouseRulesInput) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

/** The stay-time picker's options, with "Flexible" as the first of them. */
function timeOptions(stored: string, flexibleLabel: string) {
  return [
    { value: FLEXIBLE_STAY_TIME, label: flexibleLabel },
    ...stayTimeChoices(stored)
      .filter((time) => time !== FLEXIBLE_STAY_TIME)
      .map((time) => ({ value: time, label: time })),
  ];
}

// ─── Check-in & checkout ─────────────────────────────────────────────────────────

export function CheckInCheckoutEditor({
  rules,
  onChange,
  dirty,
  saving,
  onSave,
}: StayEditorProps) {
  const { resolve } = useI18n();
  const flexible = flexibleTimeLabel({ resolve });

  return (
    <ArrivalDetail
      title={
        resolve("host.editor.arrival.topic.check_in_checkout", "Check-in & checkout").text
      }
      // Public because it is: every listing page prints its arrival time, and a guest
      // decides whether a place works around a late flight before they book it.
      visibility="PUBLIC"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      saveLabel={resolve("host.editor.arrival.save", "Save").text}
      savingLabel={resolve("host.editor.arrival.saving", "Saving…").text}
    >
      <div className="space-y-8">
        <div>
          <h2 className="mb-2 text-sm font-medium leading-[1.125rem]">
            {resolve("host.editor.arrival.check_in_window", "Check-in window").text}
          </h2>
          {/* One box holding both ends, because they are one setting. Splitting them into
              two bordered fields made hosts read the second as an unrelated question. */}
          <ArrivalFieldGroup>
            <ArrivalSelect
              id="arrival-check-in-start"
              label={resolve("host.editor.arrival.start_time", "Start time").text}
              value={rules.checkInTime}
              onChange={(checkInTime) => onChange({ ...rules, checkInTime })}
              options={timeOptions(rules.checkInTime, flexible)}
            />
            <ArrivalSelect
              id="arrival-check-in-end"
              label={resolve("host.editor.arrival.end_time", "End time").text}
              value={rules.checkInEndTime}
              onChange={(checkInEndTime) => onChange({ ...rules, checkInEndTime })}
              options={timeOptions(rules.checkInEndTime, flexible)}
            />
          </ArrivalFieldGroup>
          <p className="mt-2 text-[0.8125rem] leading-[1.125rem] text-[var(--ag-foggy)]">
            {
              resolve(
                "host.editor.arrival.check_in_window_hint",
                "Flexible means guests can arrive any time after the start of the window.",
              ).text
            }
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium leading-[1.125rem]">
            {resolve("listing.house_rules.row.check_out", "Check-out").text}
          </h2>
          <ArrivalFieldGroup>
            <ArrivalSelect
              id="arrival-check-out"
              label={resolve("host.editor.arrival.time", "Time").text}
              value={rules.checkOutTime}
              onChange={(checkOutTime) => onChange({ ...rules, checkOutTime })}
              options={timeOptions(rules.checkOutTime, flexible)}
            />
          </ArrivalFieldGroup>
        </div>
      </div>
    </ArrivalDetail>
  );
}

// ─── House rules ─────────────────────────────────────────────────────────────────

export function HouseRulesPane({
  rules,
  onChange,
  dirty,
  saving,
  onSave,
  largestUpcomingParty,
}: StayEditorProps & { largestUpcomingParty: number }) {
  const { resolve } = useI18n();
  // The one thing this screen knows that the host cannot see from it: they have already
  // accepted a party larger than the limit they are about to set. Never a reason to refuse
  // the save — the stay stands either way — so it is said rather than enforced, in the same
  // words the House rules section says it in.
  const partyWarning = conflictsWithBookedParty(rules.maxGuests, largestUpcomingParty);

  return (
    <ArrivalDetail
      title={resolve("host.editor.arrival.topic.house_rules", "House rules").text}
      subtitle={
        resolve(
          "host.editor.arrival.house_rules_hint",
          "Guests agree to these when they book, and they appear on your listing page.",
        ).text
      }
      visibility="PUBLIC"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      saveLabel={resolve("host.editor.arrival.save", "Save").text}
      savingLabel={resolve("host.editor.arrival.saving", "Saving…").text}
    >
      {/* The same component the create flow and the House rules section render. Nothing
          about the rules is reimplemented here — only the frame around them differs. */}
      <HouseRulesRows
        rules={rules}
        onChange={(next) => onChange(next)}
        issues={listingHouseRulesIssues(rules)}
        idPrefix="arrival-house-rules"
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
    </ArrivalDetail>
  );
}
