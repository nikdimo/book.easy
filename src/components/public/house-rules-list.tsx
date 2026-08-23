import {
  houseRuleLines,
  type RuleLabelResolver,
} from "@/lib/i18n/house-rules-labels";
import type { HouseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";

/**
 * The house rules, as a guest reads them.
 *
 * One component for both places a guest meets them — the listing page and the booking
 * sheet they accept them in — because a guest who accepts "Pets: Ask the host" must have
 * been shown exactly that, in exactly those words, on the page they read first.
 *
 * It renders a `HouseRulesSnapshot`, which is what a listing's current rules and a
 * booking's frozen ones both are. That is deliberate: the confirmation page for an
 * existing booking can render the rules that booking actually agreed to, with no
 * separate code path that could quietly show today's instead.
 *
 * Unanswered rules are absent rather than shown as blanks — `houseRuleLines` drops them.
 * A guest has no use for the knowledge that a host skipped a question, and a row saying
 * so invites them to read it as a restriction.
 *
 * A server component: it is text, and the translator it needs is the server's.
 */
export function HouseRulesList({
  t,
  rules,
  className,
}: {
  t: RuleLabelResolver;
  rules: HouseRulesSnapshot;
  className?: string;
}) {
  const lines = houseRuleLines(t, rules);

  return (
    <dl className={className}>
      {lines.map((line) => (
        <div
          key={line.id}
          data-rule={line.id}
          className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-b-0"
        >
          <dt className="text-sm text-muted-foreground">{line.label}</dt>
          <dd className="text-sm font-medium text-foreground">{line.value}</dd>
        </div>
      ))}
      {rules.additionalRules ? (
        <div data-rule="additional-rules" className="pt-3">
          {/* The host's own words, printed as written. Never machine-translated into
              storage, and shown here as stored — see the Basics workspace's note on
              guest-facing copy for why the two must not be confused. */}
          <dt className="sr-only">{additionalRulesLabel(t)}</dt>
          <dd
            data-user-generated-content
            translate="yes"
            className="whitespace-pre-line text-sm leading-6 text-muted-foreground"
          >
            {rules.additionalRules}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function additionalRulesLabel(t: RuleLabelResolver): string {
  return t.resolve("listing.house_rules.row.additional_rules", "Additional rules").text;
}
