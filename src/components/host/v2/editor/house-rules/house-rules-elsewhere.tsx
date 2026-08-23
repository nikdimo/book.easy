import Link from "next/link";
import { ArrowRight, CalendarRange, Wallet } from "lucide-react";
import { hostCalendarHref } from "@/lib/host/v2/calendar-href";
import { T, t as text, type Translator } from "@/lib/i18n/t";

/**
 * The rules that are not edited here, and where they are.
 *
 * A House rules tab is the first place a host looks for anything that constrains a
 * booking, so the ones this project keeps somewhere else need an answer rather than an
 * absence. Every row is text and a link: giving a decision two homes is how the two
 * start disagreeing, which is the same reason the Availability pane reports rather than
 * edits.
 *
 * Two rows used to be here and are not any more. Pets moved *into* this screen as
 * `Listing.petPolicy` — an amenity checkbox could not say "ask the host" — and smoking,
 * parties, quiet hours and the host's own written rules are stored as columns rather
 * than as advice to write them into the description. What is left is genuinely owned
 * elsewhere: money rules by Pricing, dates by the Calendar.
 *
 * Rendered on the server: it is static text, and there is nothing here worth shipping a
 * client component for.
 */
export function HouseRulesElsewhere({
  listingId,
  t,
}: {
  listingId: string;
  t: Translator;
}) {
  const rows = [
    {
      key: "stay-length",
      icon: Wallet,
      title: text(
        t,
        "host.editor.house_rules.elsewhere_stay_title",
        "Shortest and longest stay",
      ),
      body: text(
        t,
        "host.editor.house_rules.elsewhere_stay_body",
        "Minimum and maximum nights are part of your pricing, and are quoted with it.",
      ),
      href: `/host/listings/${listingId}/pricing`,
      cta: text(t, "host.editor.house_rules.elsewhere_stay_cta", "Open Pricing"),
    },
    {
      key: "dates",
      icon: CalendarRange,
      title: text(
        t,
        "host.editor.house_rules.elsewhere_dates_title",
        "Which dates guests can book",
      ),
      body: text(
        t,
        "host.editor.house_rules.elsewhere_dates_body",
        "Open and blocked dates are managed on the calendar for this listing.",
      ),
      href: hostCalendarHref(listingId),
      cta: text(t, "host.editor.house_rules.elsewhere_dates_cta", "Open Calendar"),
    },
  ];

  return (
    <section className="mt-12 border-t border-slate-200 pt-8" aria-labelledby="house-rules-elsewhere">
      <h2
        id="house-rules-elsewhere"
        className="text-sm font-semibold uppercase tracking-wide text-slate-500"
      >
        <T
          t={t}
          k="host.editor.house_rules.elsewhere_heading"
          source="Rules kept somewhere else"
        />
      </h2>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4"
          >
            <row.icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-[16rem] flex-1">
              <p className="text-sm font-medium text-slate-900">{row.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{row.body}</p>
            </div>
            <Link
              href={row.href}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-center text-sm font-semibold text-slate-900 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {row.cta}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
