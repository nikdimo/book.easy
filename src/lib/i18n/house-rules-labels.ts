/**
 * Every word the house rules are said in, in one place.
 *
 * Four surfaces render these rules — the create flow's step, the post-publish editor,
 * the public listing page and the booking widget — and a guest reading "Pets: Ask the
 * host" on a listing page must read the same sentence in the booking sheet they accept
 * it in. Keeping the wording here rather than at each call site is what makes that true
 * by construction instead of by review.
 *
 * The resolver is the narrow slice of a translator that both the server's `Translator`
 * and the client's `useI18n()` already satisfy, so the same functions run on both. Every
 * key and source string below is a literal argument to `resolve`, which is what the
 * extractor (`scripts/extract-ui-strings.ts`) reads — a table of key/source pairs would
 * be invisible to it and the catalog would silently lose these strings.
 *
 * Keys are namespaced `listing.house_rules.*` rather than `host.*`: they are guest-facing
 * copy that the host side happens to reuse, not the other way round.
 */

import type {
  EventPolicy,
  HouseRulesSnapshot,
  PetPolicy,
  SmokingPolicy,
} from "@/lib/host/v2/listing-house-rules";

/** What both translators have in common. */
export interface RuleLabelResolver {
  resolve(key: string, source: string): { text: string; translated: boolean };
}

export interface RuleChoice<T extends string> {
  value: T;
  label: string;
  /** One line on what choosing this means, shown under the choice in the edit sheet. */
  description: string;
}

// ─── Section and row titles ──────────────────────────────────────────────────────

export function houseRulesSectionTitles(t: RuleLabelResolver) {
  return {
    arrival: t.resolve("listing.house_rules.section.arrival", "Arrival").text,
    guests: t.resolve("listing.house_rules.section.guests", "Guests").text,
    rules: t.resolve("listing.house_rules.section.rules", "House rules").text,
    additional: t.resolve(
      "listing.house_rules.section.additional",
      "Additional rules",
    ).text,
  };
}

export function houseRulesRowTitles(t: RuleLabelResolver) {
  return {
    checkIn: t.resolve("listing.house_rules.row.check_in", "Check-in").text,
    checkOut: t.resolve("listing.house_rules.row.check_out", "Check-out").text,
    maxGuests: t.resolve("listing.house_rules.row.max_guests", "Maximum guests").text,
    pets: t.resolve("listing.house_rules.row.pets", "Pets").text,
    smoking: t.resolve("listing.house_rules.row.smoking", "Smoking").text,
    events: t.resolve("listing.house_rules.row.events", "Parties and events").text,
    quietHours: t.resolve("listing.house_rules.row.quiet_hours", "Quiet hours").text,
    additionalRules: t.resolve(
      "listing.house_rules.row.additional_rules",
      "Additional rules",
    ).text,
  };
}

/** What a row reads when the host has not answered it. Never "Not allowed": an
 *  unanswered question is not a refusal, and this is the string that keeps the two
 *  apart everywhere they are shown. */
export function unansweredLabel(t: RuleLabelResolver): string {
  return t.resolve("listing.house_rules.unanswered", "Not set").text;
}

/** The stay time a host has not committed to. Matches how the public page already
 *  treats a null arrival time: nothing was promised. */
export function flexibleTimeLabel(t: RuleLabelResolver): string {
  return t.resolve("listing.house_rules.flexible_time", "Flexible").text;
}

// ─── Pets ────────────────────────────────────────────────────────────────────────

export function petPolicyLabel(t: RuleLabelResolver, policy: PetPolicy): string {
  switch (policy) {
    case "ALLOWED":
      return t.resolve("listing.house_rules.pets.allowed", "Allowed").text;
    case "NOT_ALLOWED":
      return t.resolve("listing.house_rules.pets.not_allowed", "Not allowed").text;
    case "ASK_HOST":
      return t.resolve("listing.house_rules.pets.ask_host", "Ask the host").text;
  }
}

export function petPolicyChoices(t: RuleLabelResolver): RuleChoice<PetPolicy>[] {
  return [
    {
      value: "ALLOWED",
      label: petPolicyLabel(t, "ALLOWED"),
      description: t.resolve(
        "listing.house_rules.pets.allowed_hint",
        "Guests can bring pets without asking first.",
      ).text,
    },
    {
      value: "NOT_ALLOWED",
      label: petPolicyLabel(t, "NOT_ALLOWED"),
      description: t.resolve(
        "listing.house_rules.pets.not_allowed_hint",
        "Service animals are usually exempt by law, wherever you host.",
      ).text,
    },
    {
      value: "ASK_HOST",
      label: petPolicyLabel(t, "ASK_HOST"),
      description: t.resolve(
        "listing.house_rules.pets.ask_host_hint",
        "Guests message you before booking, and you decide case by case.",
      ).text,
    },
  ];
}

// ─── Smoking ─────────────────────────────────────────────────────────────────────

export function smokingPolicyLabel(t: RuleLabelResolver, policy: SmokingPolicy): string {
  switch (policy) {
    case "NOT_ALLOWED":
      return t.resolve("listing.house_rules.smoking.not_allowed", "Not allowed").text;
    case "OUTDOORS_ONLY":
      return t.resolve("listing.house_rules.smoking.outdoors_only", "Outdoors only").text;
    case "ALLOWED":
      return t.resolve("listing.house_rules.smoking.allowed", "Allowed").text;
  }
}

export function smokingPolicyChoices(
  t: RuleLabelResolver,
): RuleChoice<SmokingPolicy>[] {
  return [
    {
      value: "NOT_ALLOWED",
      label: smokingPolicyLabel(t, "NOT_ALLOWED"),
      description: t.resolve(
        "listing.house_rules.smoking.not_allowed_hint",
        "No smoking or vaping anywhere on the property.",
      ).text,
    },
    {
      value: "OUTDOORS_ONLY",
      label: smokingPolicyLabel(t, "OUTDOORS_ONLY"),
      description: t.resolve(
        "listing.house_rules.smoking.outdoors_only_hint",
        "Allowed on the balcony, terrace or garden, but not indoors.",
      ).text,
    },
    {
      value: "ALLOWED",
      label: smokingPolicyLabel(t, "ALLOWED"),
      description: t.resolve(
        "listing.house_rules.smoking.allowed_hint",
        "Allowed indoors as well as outside.",
      ).text,
    },
  ];
}

// ─── Parties and events ──────────────────────────────────────────────────────────

export function eventPolicyLabel(t: RuleLabelResolver, policy: EventPolicy): string {
  switch (policy) {
    case "ALLOWED":
      return t.resolve("listing.house_rules.events.allowed", "Allowed").text;
    case "NOT_ALLOWED":
      return t.resolve("listing.house_rules.events.not_allowed", "Not allowed").text;
  }
}

export function eventPolicyChoices(t: RuleLabelResolver): RuleChoice<EventPolicy>[] {
  return [
    {
      value: "NOT_ALLOWED",
      label: eventPolicyLabel(t, "NOT_ALLOWED"),
      description: t.resolve(
        "listing.house_rules.events.not_allowed_hint",
        "Only the guests on the booking may stay or gather at the property.",
      ).text,
    },
    {
      value: "ALLOWED",
      label: eventPolicyLabel(t, "ALLOWED"),
      description: t.resolve(
        "listing.house_rules.events.allowed_hint",
        "Guests may host a party or event, within your other rules.",
      ).text,
    },
  ];
}

// ─── Quiet hours ─────────────────────────────────────────────────────────────────

export function quietHoursNoneLabel(t: RuleLabelResolver): string {
  return t.resolve("listing.house_rules.quiet_hours.none", "No quiet hours").text;
}

export function quietHoursSetLabel(t: RuleLabelResolver): string {
  return t.resolve("listing.house_rules.quiet_hours.set", "Set quiet hours").text;
}

export function quietHoursChoices(t: RuleLabelResolver): RuleChoice<"NONE" | "SET">[] {
  return [
    {
      value: "NONE",
      label: quietHoursNoneLabel(t),
      description: t.resolve(
        "listing.house_rules.quiet_hours.none_hint",
        "Your listing shows no quiet-hours rule.",
      ).text,
    },
    {
      value: "SET",
      label: quietHoursSetLabel(t),
      description: t.resolve(
        "listing.house_rules.quiet_hours.set_hint",
        "Choose the hours guests should keep noise down. These normally run overnight.",
      ).text,
    },
  ];
}

/** "22:00–08:00". An en dash, and no direction check: quiet hours crossing midnight is
 *  the ordinary case, not an error to correct. */
export function quietHoursRangeLabel(start: string, end: string): string {
  return `${start}–${end}`;
}

// ─── One rule, as a guest reads it ───────────────────────────────────────────────

export interface HouseRuleLine {
  /** Stable identifier for a React key and for tests. */
  id: string;
  label: string;
  value: string;
}

/**
 * The rules a guest is shown, from a listing row or from the snapshot frozen onto their
 * booking — the same function for both, because they must read identically.
 *
 * Unanswered policies are left out entirely rather than rendered as "Not set": a guest
 * has no use for the knowledge that a host skipped a question, and printing a row for it
 * invites them to read it as a restriction. `maxGuests` is always present because a
 * listing cannot exist without one.
 */
export function houseRuleLines(
  t: RuleLabelResolver,
  rules: HouseRulesSnapshot,
): HouseRuleLine[] {
  const titles = houseRulesRowTitles(t);
  const lines: HouseRuleLine[] = [];

  if (rules.checkInTime) {
    lines.push({ id: "check-in", label: titles.checkIn, value: rules.checkInTime });
  }
  if (rules.checkOutTime) {
    lines.push({ id: "check-out", label: titles.checkOut, value: rules.checkOutTime });
  }
  lines.push({
    id: "max-guests",
    label: titles.maxGuests,
    value: String(rules.maxGuests),
  });
  if (rules.petPolicy) {
    lines.push({
      id: "pets",
      label: titles.pets,
      value: petPolicyLabel(t, rules.petPolicy),
    });
  }
  if (rules.smokingPolicy) {
    lines.push({
      id: "smoking",
      label: titles.smoking,
      value: smokingPolicyLabel(t, rules.smokingPolicy),
    });
  }
  if (rules.eventPolicy) {
    lines.push({
      id: "events",
      label: titles.events,
      value: eventPolicyLabel(t, rules.eventPolicy),
    });
  }
  if (rules.quietHoursPolicy === "SET" && rules.quietHoursStart && rules.quietHoursEnd) {
    lines.push({
      id: "quiet-hours",
      label: titles.quietHours,
      value: quietHoursRangeLabel(rules.quietHoursStart, rules.quietHoursEnd),
    });
  } else if (rules.quietHoursPolicy === "NONE") {
    lines.push({
      id: "quiet-hours",
      label: titles.quietHours,
      value: quietHoursNoneLabel(t),
    });
  }

  return lines;
}
