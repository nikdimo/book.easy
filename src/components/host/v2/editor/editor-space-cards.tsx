"use client";

import Link from "next/link";
import { Check, CircleAlert } from "lucide-react";
import {
  EDITOR_NAV_GROUPS,
  type EditorNavItem,
} from "@/lib/host/v2/editor-sections";
import { EDITOR_LEFT_COLUMN_CLASS } from "@/lib/host/v2/editor-layout";
import type { ListingEditorOverview } from "@/lib/services/listing-editor.service";
import { sectionSummary } from "@/components/host/v2/editor/overview/editor-overview";
import { resolveEditorLabel } from "@/lib/i18n/editor-label";
import { t as text, tPlural } from "@/lib/i18n/t";
import { useI18n } from "@/lib/i18n/client";

/**
 * The "Your space" half's left column: one card per section, the way Airbnb's is.
 *
 * It replaced a 208px rail of text links, and the reason is the toggle above it. Two
 * halves that share a switch have to share a column, or pressing the switch resizes and
 * restyles the page under the host's cursor — which is exactly what a 208px rail beside a
 * 38% card list did. Now both halves draw the same column at the same width
 * (`EDITOR_LEFT_COLUMN_CLASS`) with the same cards, and only the contents change.
 *
 * Cards carry a summary line, not just a label, because that is the difference between a
 * menu and an index: "Location — Ohrid, North Macedonia" answers the question a host
 * opened the section to ask, and a rail row reading "Location" does not. The summaries are
 * `sectionSummary`, the same function the overview's cards use, so the two can never
 * disagree about how many photos a listing has.
 *
 * The two group headings are a deliberate departure from Airbnb, who have none. Theirs is
 * a flat list because their listing editor holds only content; ours also holds Availability
 * and Pricing, and dropping those into a flat list of nine puts "what a night costs" between
 * "Photos" and "Title" with nothing to say they are a different kind of thing.
 */
export function EditorSpaceCards({
  listingId,
  current,
  overview,
  attention,
}: {
  listingId: string;
  /** The section slug the host is on, so its card is marked. */
  current: string;
  /** Section summaries and completion. Absent for a route that has not loaded it — the
   *  cards then show their labels alone rather than nothing at all. */
  overview: ListingEditorOverview | null;
  /** Section slugs with an open task, from `editorAttentionSlugs`. */
  attention: string[];
}) {
  // A client component so the frame around it stays synchronous. It resolves the same
  // keys the server translator would; `t`/`tPlural` take either — see `TextTranslator`.
  const t = useI18n();
  const open = new Set(attention);

  return (
    <nav
      aria-label={text(t, "host.editor.nav_label", "Listing sections")}
      className={`hidden min-w-0 flex-col lg:flex lg:min-h-0 ${EDITOR_LEFT_COLUMN_CLASS}`}
    >
      {/* The list scrolls, the progress line does not: on a short laptop screen the
          sections overflow the frame, and the thing that gets clipped should never be the
          summary of what is left to do. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {EDITOR_NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.id} className={groupIndex > 0 ? "mt-6" : undefined}>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--ag-bobo)]">
              {resolveEditorLabel(t, group.key, group.source).text}
            </p>
            <ul className="space-y-3">
              {group.items.map((item) => (
                <SectionListCard
                  key={item.slug}
                  item={item}
                  listingId={listingId}
                  current={current}
                  overview={overview}
                  needsAttention={open.has(item.slug)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* What is left, not how far along: a count of open tasks is the same fact the cards
          above are marked with, and it does not need a denominator the host cannot see. */}
      <div className="shrink-0 px-6 pb-6 pt-2">
        {attention.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check className="size-3.5 shrink-0" aria-hidden />
            {text(t, "host.editor.attention_clear", "Nothing needs attention")}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-[var(--ag-foggy)]">
            <CircleAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden />
            {
              tPlural(
                t,
                "host.editor.attention_count",
                attention.length,
                "{n} thing needs your attention",
                "{n} things need your attention",
              ).text
            }
          </p>
        )}
      </div>
    </nav>
  );
}

function SectionListCard({
  item,
  listingId,
  current,
  overview,
  needsAttention,
}: {
  item: EditorNavItem;
  listingId: string;
  current: string;
  overview: ListingEditorOverview | null;
  needsAttention: boolean;
}) {
  const t = useI18n();
  const label = resolveEditorLabel(t, item.key, item.source);
  const summary = overview ? sectionSummary(item.slug, overview, t) : null;
  const active = item.slug === current;

  return (
    <li>
      <Link
        href={item.href(listingId)}
        aria-current={active ? "page" : undefined}
        translate={label.translated ? "no" : undefined}
        className="ag-list-card block px-4 py-4"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium leading-[1.125rem] text-[var(--ag-hof)]">
          <span className="min-w-0 truncate">{label.text}</span>
          {needsAttention && (
            <CircleAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden />
          )}
        </span>
        {summary && (
          <span className="mt-1 block truncate text-sm leading-[1.125rem] text-[var(--ag-foggy)]">
            {summary}
          </span>
        )}
      </Link>
    </li>
  );
}
