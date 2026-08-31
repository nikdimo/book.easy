"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import {
  houseRulesDraftPatch,
  houseRulesFromDraft,
} from "@/lib/host/v2/listing-house-rules-draft";
import {
  REQUIRED_POLICY_COUNT,
  answeredPolicyCount,
  emptyListingHouseRules,
  houseRuleRowId,
  houseRuleRowsWithIssues,
  listingHouseRulesIssues,
  normalizeStayTime,
  type HouseRuleRow,
  type ListingHouseRulesInput,
  type ListingHouseRulesIssues,
} from "@/lib/host/v2/listing-house-rules";
import { HouseRulesRows } from "@/components/host/v2/house-rules/house-rules-rows";
import { houseRuleRowTitle } from "@/lib/i18n/house-rules-labels";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { reviewHref, stepNextTarget } from "@/lib/host/v2/listing-flow-return";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

const ID_PREFIX = "flow-house-rules";
const SUMMARY_ID = "house-rules-error-summary";

/**
 * Phase two, house rules.
 *
 * The screen itself is `HouseRulesRows`, which the post-publish editor also renders —
 * the rules, their wording and their validation are the same component in both places.
 * What this file owns is the part that is genuinely different: a draft to save into, a
 * Next that must not let an unanswered rule through, and the job of explaining that.
 *
 * Every policy is required here, and nowhere else. A host publishing today is being
 * asked the question, so leaving it blank is an unfinished screen rather than a
 * decision — while the editor, which the same component serves, must never hold a
 * listing published before these columns existed hostage over a question its host was
 * never asked. `requireAnswers` is that difference, and it is one argument rather than
 * two implementations.
 *
 * The explaining is the part that was missing. Four rows reading "Not set", a CTA that
 * looked live, and a press that did nothing visible because the errors it revealed were
 * three screens above the footer the host had just reached. So: the rows say Required
 * before anything is pressed, a progress line counts the answers down, and a blocked
 * Next raises one summary beside the rules, scrolls the first unanswered rule to the
 * middle of the viewport — clear of the sticky footer — and puts the cursor on it.
 */
export function HouseRulesStep({
  propertyType,
  spaceType,
  returnToReview = false,
  initialCheckInTime = "15:00",
  initialCheckOutTime = "11:00",
  initialMaxGuests = 2,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Reached from the Review screen's "Edit". */
  returnToReview?: boolean;
  /** Test seams. The flow arrives here with the usual afternoon/morning pair. */
  initialCheckInTime?: string;
  initialCheckOutTime?: string;
  initialMaxGuests?: number;
}) {
  const { data, save } = useHostStartDraft();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  /** Where the CTA goes, and what it says: on to the next question, or back to the
   *  summary the host came from. */
  const { href: nextHref, label: nextLabel, route: nextRoute } = stepNextTarget(
    returnToReview,
    query,
    `/host/start/review?${query}`,
  );

  const [rules, setRules] = useState<ListingHouseRulesInput>(() =>
    houseRulesFromDraft(data, {
      ...emptyListingHouseRules(),
      checkInTime: normalizeStayTime(initialCheckInTime),
      checkOutTime: normalizeStayTime(initialCheckOutTime),
      maxGuests: initialMaxGuests,
    }),
  );
  /** Only after a blocked Next: opening a fresh screen already covered in red errors
   *  tells the host they got something wrong before they have been asked anything. */
  const [showIssues, setShowIssues] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  /** Bumped whenever the summary should take the cursor. It is not in the DOM at the
   *  moment the handler decides that, so the move waits for the render that adds it. */
  const [summaryFocusToken, setSummaryFocusToken] = useState(0);

  const issues = listingHouseRulesIssues(rules, { requireAnswers: true });
  const invalid = Object.keys(issues).length > 0;
  const answered = answeredPolicyCount(rules);

  useEffect(() => {
    if (summaryFocusToken === 0) return;
    const element = document.getElementById(SUMMARY_ID);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  }, [summaryFocusToken]);

  /**
   * Sends the host to one row: into view, clear of the footer, cursor on it.
   *
   * `open` is the difference between the two ways a host gets here. A blocked Next
   * shows them where the problem is and leaves the summary on screen to read; picking a
   * rule out of that summary is already a choice of which one to answer, so that opens
   * its sheet rather than asking for a second press on a row they just chose.
   */
  function goToRow(row: HouseRuleRow, open = false) {
    if (typeof document === "undefined") return;
    const element = document.getElementById(houseRuleRowId(ID_PREFIX, row));
    // `center`, not `start`: the sticky footer owns the bottom of the viewport, and a
    // row scrolled to the top of a short screen can still end up underneath it.
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus?.({ preventScroll: true });
    // The row is a button; its own handler owns the sheet, and closing it returns
    // focus here — which is where the cursor now is.
    if (open) element?.click?.();
  }

  return (
    <>
      <main className="flex-1 px-5 pb-40 pt-6 md:px-8 md:pb-32 md:pt-10">
        <div className="mx-auto w-full max-w-[39rem]">
          <HouseRulesRows
            idPrefix={ID_PREFIX}
            rules={rules}
            issues={issues}
            showIssues={showIssues}
            requireAnswers
            onChange={setRules}
            arrivalHeader={
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                <Tx
                  k="host.v2.house_rules.defaults_note"
                  source="These start at the usual times and party size. Change any of them if yours are different."
                />
              </p>
            }
            rulesHeader={
              <RulesHeader
                answered={answered}
                showIssues={showIssues}
                issues={issues}
                saveFailed={saveFailed}
                onGoToRow={goToRow}
              />
            }
          />
        </div>
      </main>
      <ListingFlowFooter
        // No `nextHref` while a rule is unanswered, so the CTA cannot navigate — but it
        // keeps its handler, because a Next that silently does nothing is
        // indistinguishable from a broken one. Pressing it says what is missing and
        // takes the host to the first of it.
        {...(invalid ? {} : { nextHref })}
        onNext={async () => {
          if (invalid) {
            setShowIssues(true);
            setSaveFailed(false);
            const [first] = houseRuleRowsWithIssues(issues);
            if (first) goToRow(first);
            return;
          }
          setSaveFailed(false);
          if (
            await save({
              ...houseRulesDraftPatch(rules),
              currentStepId: "specialOffer",
              currentRoute: nextRoute,
            })
          ) {
            window.location.assign(nextHref);
            return;
          }
          // Every answer stays where it is: this state lives in the component, and a
          // refused PATCH never touched it.
          setSaveFailed(true);
          setSummaryFocusToken((token) => token + 1);
        }}
        backHref={returnToReview ? reviewHref(query) : `/host/start/availability?${query}`}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={60}
        nextLabel={nextLabel}
      />
    </>
  );
}

/**
 * How many answers are in, and — once the host has pressed Next — which ones are not.
 *
 * It sits inside the House rules section rather than at the top of the page, because
 * that is where a host who cannot get past this screen is looking, and because on a
 * phone the top of the page is several scrolls away from the footer they just pressed.
 */
export function RulesHeader({
  answered,
  showIssues,
  issues,
  saveFailed,
  onGoToRow,
}: {
  answered: number;
  showIssues: boolean;
  issues: ListingHouseRulesIssues;
  saveFailed: boolean;
  onGoToRow: (row: HouseRuleRow, open?: boolean) => void;
}) {
  const { resolve } = useI18n();
  const rows = showIssues ? houseRuleRowsWithIssues(issues) : [];
  const complete = answered === REQUIRED_POLICY_COUNT;

  return (
    <>
      <p className="mt-1.5 text-sm leading-6 text-slate-500">
        <Tx
          k="host.v2.house_rules.required_note"
          source="Guests agree to these when they book, so all four need an answer before you continue."
        />
      </p>
      <p
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          complete ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700",
        )}
      >
        {complete ? <CircleCheck className="size-3.5 shrink-0" aria-hidden /> : null}
        {/* A live region, and the only one on the screen that speaks while the host is
            still answering: every choice they make moves this line. */}
        <span aria-live="polite">
          {
            interpolate(
              resolve("host.v2.house_rules.progress", "{answered} of {total} answered"),
              { answered, total: REQUIRED_POLICY_COUNT },
            ).text
          }
        </span>
      </p>

      {rows.length > 0 || saveFailed ? (
        <div
          id={SUMMARY_ID}
          tabIndex={-1}
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {saveFailed && rows.length === 0 ? (
              <Tx
                k="host.v2.house_rules.save_failed_heading"
                source="Your house rules were not saved"
              />
            ) : (
              <Tx
                k="host.v2.house_rules.errors_heading"
                source="Answer these house-rule questions to continue"
              />
            )}
          </h3>
          {saveFailed ? (
            <p className="mt-2 text-sm leading-6 text-rose-800">
              <Tx
                k="host.v2.house_rules.save_failed"
                source="Nothing you answered was lost. Check your connection and try again."
              />
            </p>
          ) : null}
          {rows.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {rows.map((row) => (
                <li key={row}>
                  {/* A control, not a bullet: the rule it names is one press away, from
                      the keyboard as much as the pointer. */}
                  <button
                    type="button"
                    onClick={() => onGoToRow(row, true)}
                    className="text-left text-sm leading-6 text-rose-800 underline underline-offset-4 hover:text-rose-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                  >
                    {houseRuleRowTitle({ resolve }, row)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
