"use client";

import { useState } from "react";
import {
  houseRulesDraftPatch,
  houseRulesFromDraft,
} from "@/lib/host/v2/listing-house-rules-draft";
import {
  emptyListingHouseRules,
  listingHouseRulesIssues,
  normalizeStayTime,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import { HouseRulesRows } from "@/components/host/v2/house-rules/house-rules-rows";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

/**
 * Phase two, house rules.
 *
 * The screen itself is `HouseRulesRows`, which the post-publish editor also renders —
 * the rules, their wording and their validation are the same in both places because
 * they are the same component. What this file owns is the part that is genuinely
 * different: a draft to save into, and a Next that must not let an unanswered rule
 * through.
 *
 * Every policy is required here, and nowhere else. A host publishing today is being
 * asked the question, so leaving it blank is an unfinished screen rather than a
 * decision — while the editor, which the same component serves, must never hold a
 * listing published before these columns existed hostage over a question its host was
 * never asked. `requireAnswers` is that difference, and it is one argument rather than
 * two implementations.
 *
 * The check runs on every render, not on submit: Next stops leading anywhere the moment
 * a rule is missing, so the host is never allowed to walk to Review and be told there
 * that this screen was incomplete.
 */
export function HouseRulesStep({
  propertyType,
  spaceType,
  initialCheckInTime = "15:00",
  initialCheckOutTime = "11:00",
  initialMaxGuests = 2,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Test seams. The flow arrives here with the usual afternoon/morning pair. */
  initialCheckInTime?: string;
  initialCheckOutTime?: string;
  initialMaxGuests?: number;
}) {
  const { data, save } = useHostStartDraft();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;

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

  const issues = listingHouseRulesIssues(rules, { requireAnswers: true });
  const invalid = Object.keys(issues).length > 0;

  return (
    <>
      <main className="flex-1 px-5 pb-32 pt-6 md:px-8 md:pb-32 md:pt-10">
        <div className="mx-auto w-full max-w-[39rem]">
          <HouseRulesRows
            idPrefix="flow-house-rules"
            rules={rules}
            issues={issues}
            showIssues={showIssues}
            onChange={setRules}
          />
        </div>
      </main>
      <ListingFlowFooter
        // No `nextHref` while a rule is unanswered, so the CTA cannot navigate — but it
        // keeps its handler, because a Next that silently does nothing is indistinguishable
        // from a broken one. Pressing it reveals which rows are missing instead.
        {...(invalid ? {} : { nextHref: `/host/start/review?${query}` })}
        onNext={async () => {
          if (invalid) {
            setShowIssues(true);
            return;
          }
          // Nothing navigates on a failed save: the host stays here with the toast the
          // draft provider raised.
          if (
            await save({
              ...houseRulesDraftPatch(rules),
              currentStepId: "specialOffer",
            })
          ) {
            window.location.assign(`/host/start/review?${query}`);
          }
        }}
        backHref={`/host/start/availability?${query}`}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={60}
        nextLabel="Next"
      />
    </>
  );
}
