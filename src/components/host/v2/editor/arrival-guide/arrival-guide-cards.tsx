"use client";

import { ChevronRight, Clock3, Users } from "lucide-react";
import {
  ARRIVAL_GUIDE_TOPICS,
  arrivalTopicAnswered,
  type ListingArrivalGuideInput,
} from "@/lib/host/v2/listing-arrival-guide";
import {
  FLEXIBLE_STAY_TIME,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import {
  checkInMethodLabel,
  interactionPreferenceLabel,
} from "@/lib/i18n/arrival-guide-labels";
import { flexibleTimeLabel } from "@/lib/i18n/house-rules-labels";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * The left column: nine cards, in Airbnb's order.
 *
 * Each card is an anchor with a real `href`, not a button. That is what makes middle-click
 * and ⌘-click open the card in a new tab the way every other link on the site does, and it
 * is why the URL in the status bar names the card the host is pointing at. A plain click is
 * intercepted so the pane swaps without a server round trip — see `onSelect` — which is the
 * only way an unsaved edit in one card can survive a look at another.
 */
export function ArrivalGuideCards({
  href,
  current,
  guide,
  rules,
  onSelect,
}: {
  href: (slug: string) => string;
  current: string;
  guide: ListingArrivalGuideInput;
  rules: ListingHouseRulesInput;
  onSelect: (slug: string) => void;
}) {
  const i18n = useI18n();
  const { resolve } = i18n;
  const addDetails = resolve("host.editor.arrival.add_details", "Add details").text;

  return (
    <ul className="space-y-3">
      {ARRIVAL_GUIDE_TOPICS.map((topic) => {
        const title = resolve(topic.key, topic.source).text;
        const active = topic.slug === current;
        return (
          <li key={topic.slug}>
            <a
              href={href(topic.slug)}
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                // Everything that is not a plain left click keeps its browser meaning:
                // a new tab, a new window, a download. Only the ordinary click is ours.
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                onSelect(topic.slug);
              }}
              className="ag-card block w-full px-4 py-4 text-start"
            >
              {topic.slug === "check-in-checkout" ? (
                <StayTimesCard rules={rules} />
              ) : topic.slug === "house-rules" ? (
                <HouseRulesCard title={title} rules={rules} />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-[1.125rem]">{title}</p>
                    <p className="mt-1 truncate text-sm leading-[1.125rem] text-[var(--ag-foggy)]">
                      {topic.slug === "guidebooks"
                        ? resolve(
                            "host.editor.arrival.guidebooks_card",
                            "Create a guidebook to share your local tips with guests.",
                          ).text
                        : arrivalTopicAnswered(topic.slug, guide)
                          ? summary(topic.slug, guide, i18n)
                          : addDetails}
                    </p>
                  </div>
                  {/* Below the split the card leads somewhere else entirely, so it says
                      so. Beside a detail pane a chevron would point at nothing. */}
                  <ChevronRight
                    className="size-4 shrink-0 text-[var(--ag-bobo)] lg:hidden"
                    aria-hidden
                  />
                </div>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** The two stay times, side by side with a hairline between them — Airbnb's first card. */
function StayTimesCard({ rules }: { rules: ListingHouseRulesInput }) {
  const { resolve } = useI18n();
  // The canonical wording, from the module that owns every house-rules term. A second
  // key for "Flexible" would eventually be translated into a second word for it.
  const flexible = flexibleTimeLabel({ resolve });
  const time = (value: string) =>
    value === FLEXIBLE_STAY_TIME ? flexible : value;

  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-[1.125rem]">
          {resolve("listing.house_rules.row.check_in", "Check-in").text}
        </p>
        <p className="mt-1 text-sm leading-[1.125rem] text-[var(--ag-foggy)]">
          <span className="notranslate tabular-nums" translate="no">
            {time(rules.checkInTime)}
          </span>
        </p>
      </div>
      <div className="mx-4 w-px shrink-0 bg-[var(--ag-deco)]" aria-hidden />
      <div className="min-w-0 flex-1 text-end">
        <p className="text-sm font-medium leading-[1.125rem]">
          {resolve("listing.house_rules.row.check_out", "Check-out").text}
        </p>
        <p className="mt-1 text-sm leading-[1.125rem] text-[var(--ag-foggy)]">
          <span className="notranslate tabular-nums" translate="no">
            {time(rules.checkOutTime)}
          </span>
        </p>
      </div>
    </div>
  );
}

/** House rules summarises itself with the two facts a host most often checks: when guests
 *  may arrive, and how many of them there may be. */
function HouseRulesCard({
  title,
  rules,
}: {
  title: string;
  rules: ListingHouseRulesInput;
}) {
  const i18n = useI18n();
  const { resolve } = i18n;

  const arrival =
    rules.checkInTime === FLEXIBLE_STAY_TIME
      ? resolve("host.editor.arrival.check_in_flexible", "Flexible check-in").text
      : rules.checkInEndTime === FLEXIBLE_STAY_TIME
        ? interpolate(
            resolve("host.editor.arrival.check_in_after", "Check-in after {time}"),
            { time: rules.checkInTime },
          ).text
        : interpolate(
            resolve(
              "host.editor.arrival.check_in_between",
              "Arrive between {start} and {end}",
            ),
            { start: rules.checkInTime, end: rules.checkInEndTime },
          ).text;

  const guests = i18n.plural(
    "host.editor.arrival.guests_maximum",
    rules.maxGuests,
    "{n} guest maximum",
    "{n} guests maximum",
  ).text;

  return (
    <div>
      <p className="text-sm font-medium leading-[1.125rem]">{title}</p>
      <ul className="mt-2 space-y-1.5">
        <SummaryLine icon={Clock3} text={arrival} />
        <SummaryLine icon={Users} text={guests} />
      </ul>
    </div>
  );
}

function SummaryLine({
  icon: Icon,
  text,
}: {
  icon: typeof Clock3;
  text: string;
}) {
  return (
    <li className="flex items-center gap-2 text-sm leading-[1.125rem] text-[var(--ag-foggy)]">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{text}</span>
    </li>
  );
}

/**
 * What an answered card says instead of "Add details".
 *
 * Never the value itself for a secret. A card list is the most over-the-shoulder-readable
 * surface in the panel — it is what is on screen while a host shows somebody their
 * listing — so the Wi-Fi card says that a password is set, not what it is. Reading it
 * takes opening the card, which is a deliberate act.
 */
function summary(
  slug: string,
  guide: ListingArrivalGuideInput,
  i18n: ReturnType<typeof useI18n>,
): string {
  const { resolve } = i18n;
  switch (slug) {
    case "directions":
      return firstLine(guide.directions);
    case "check-in-method":
      return guide.checkInMethod
        ? checkInMethodLabel({ resolve }, guide.checkInMethod)
        : "";
    case "wifi-details":
      return guide.wifiNetwork || resolve("host.editor.arrival.wifi_saved", "Saved").text;
    case "house-manual":
      return firstLine(guide.houseManual);
    case "checkout-instructions":
      return i18n.plural(
        "host.editor.arrival.instruction_count",
        guide.checkoutInstructions.length,
        "{n} instruction",
        "{n} instructions",
      ).text;
    case "interaction-preferences":
      // The answer itself, not "Answered". It is public, it is one sentence, and the whole
      // reason to summarise a card is to save the host from opening it to remember.
      return guide.interactionPreference
        ? interactionPreferenceLabel({ resolve }, guide.interactionPreference)
        : "";
    default:
      return "";
  }
}

/** A one-line preview of a paragraph, so a card stays one line tall whatever the host
 *  wrote. The clamp is a class rather than a substring so the cut lands on the pixel
 *  rather than mid-word. */
function firstLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
