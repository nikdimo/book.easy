"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EDITOR_COMPLETION_SECTIONS,
  EDITOR_NAV_GROUPS,
  EDITOR_NAV_ITEMS,
  editorCompletionCount,
  findEditorSection,
  type EditorNavItem,
} from "@/lib/host/v2/editor-sections";
import { resolveEditorLabel } from "@/lib/i18n/editor-label";
import { interpolate, useI18n } from "@/lib/i18n/client";

/** How many chips the small-screen row shows before the rest go under "More".
 *  Three is what fits a 360px screen without the longest label wrapping. */
const VISIBLE_CHIPS = 3;

/**
 * The editor's navigation, in two shapes that share one source of truth.
 *
 * Desktop is a grouped rail: Overview, then what the calendar decides, then what the
 * listing itself says. Below `lg` it is a chip row that does not scroll — a scrolling
 * row hides items behind a gesture with no affordance, and the last chip always looks
 * clipped mid-word. Instead the row shows a window of items around the current one, and
 * "More" holds the complete grouped list, so the menu answers "what are all the parts of
 * a listing" whichever one you happen to be on.
 *
 * `EDITOR_NAV_GROUPS` is the only place the order and the grouping live; nothing here
 * restates either.
 */
export function EditorNav({
  listingId,
  current,
  complete,
}: {
  listingId: string;
  current: string;
  /** Section slugs that have enough filled in to count as done. */
  complete: string[];
}) {
  const { resolve } = useI18n();
  const done = new Set(
    complete.filter((slug) => findEditorSection(slug)?.completion === true),
  );
  const total = EDITOR_COMPLETION_SECTIONS.length;
  const completedCount = editorCompletionCount(complete);

  // Clamp so the window is always full and always contains the current item, even at
  // either end of the list.
  const currentIndex = Math.max(
    0,
    EDITOR_NAV_ITEMS.findIndex((item) => item.slug === current),
  );
  const windowStart = Math.min(
    Math.max(currentIndex - 1, 0),
    Math.max(EDITOR_NAV_ITEMS.length - VISIBLE_CHIPS, 0),
  );
  const visible = EDITOR_NAV_ITEMS.slice(windowStart, windowStart + VISIBLE_CHIPS);

  const label = (item: EditorNavItem) =>
    resolveEditorLabel({ resolve }, item.key, item.source);

  return (
    <>
      {/* Phone and tablet: a fixed row plus an overflow menu. */}
      <nav
        aria-label={resolve("host.editor.nav_label", "Listing sections").text}
        className="-mx-4 flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 sm:-mx-5 sm:px-5 lg:hidden"
      >
        {visible.map((item) => {
          const text = label(item);
          const active = !item.external && item.slug === current;
          return (
            <Link
              key={item.slug}
              href={item.href(listingId)}
              aria-current={active ? "page" : undefined}
              translate={text.translated ? "no" : undefined}
              className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span className="truncate">{text.text}</span>
              {done.has(item.slug) && !active && (
                <Check className="size-3 shrink-0 text-emerald-600" aria-hidden />
              )}
            </Link>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none">
            {resolve("host.editor.nav_more", "More").text}
            <ChevronDown className="size-3.5 text-slate-400" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[70dvh] w-56 overflow-y-auto bg-white"
          >
            {EDITOR_NAV_GROUPS.map((group) => (
              <div key={group.id}>
                <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {resolveEditorLabel({ resolve }, group.key, group.source).text}
                </DropdownMenuLabel>
                {group.items.map((item) => {
                  const text = label(item);
                  const active = !item.external && item.slug === current;
                  return (
                    <DropdownMenuItem key={item.slug} asChild className="gap-2">
                      <Link
                        href={item.href(listingId)}
                        aria-current={active ? "page" : undefined}
                        translate={text.translated ? "no" : undefined}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${active ? "font-medium text-slate-900" : ""}`}
                        >
                          {text.text}
                        </span>
                        {done.has(item.slug) && (
                          <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* Desktop rail. */}
      <nav
        aria-label={resolve("host.editor.nav_label", "Listing sections").text}
        className="hidden w-52 shrink-0 flex-col border-r border-slate-100 py-4 pr-4 lg:flex lg:min-h-0"
      >
        {/* The list scrolls, the progress line does not: on a short laptop screen the
            sections plus the footer overflow the frame, and the thing that gets clipped
            should never be the summary of what is left to do. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {EDITOR_NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.id} className={groupIndex > 0 ? "mt-5 border-t border-slate-100 pt-4" : undefined}>
              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {resolveEditorLabel({ resolve }, group.key, group.source).text}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const text = label(item);
                  const active = !item.external && item.slug === current;
                  return (
                    <li key={item.slug}>
                      <Link
                        href={item.href(listingId)}
                        aria-current={active ? "page" : undefined}
                        translate={text.translated ? "no" : undefined}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-slate-100 font-medium text-slate-900"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{text.text}</span>
                        {/* Only completion is marked. A dot on every unfinished row
                            would put ten indicators on screen to say nothing. */}
                        {done.has(item.slug) && (
                          <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 shrink-0 px-3">
          <p className="text-xs text-slate-500">
            {
              interpolate(
                resolve("host.editor.progress", "{done} of {total} complete"),
                { done: completedCount, total },
              ).text
            }
          </p>
          <div
            className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completedCount}
          >
            <div
              className="h-full rounded-full bg-slate-800 transition-[width] duration-300"
              style={{ width: `${(completedCount / total) * 100}%` }}
            />
          </div>
        </div>
      </nav>
    </>
  );
}
