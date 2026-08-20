"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import {
  EDITOR_COMPLETION_SECTIONS,
  EDITOR_SECTIONS,
  editorCompletionCount,
} from "@/lib/host/v2/editor-sections";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * The editor's section navigation, in two shapes that share one source of truth.
 *
 * Desktop is a rail; below `lg` it becomes a horizontally scrolling chip row under the
 * header. The chips are deliberately not a dropdown: a host mid-way through setting up a
 * listing benefits from seeing what else is left, and a `<select>` hides exactly that.
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
  const done = new Set(complete);
  const total = EDITOR_COMPLETION_SECTIONS.length;
  const completedCount = editorCompletionCount(complete);

  return (
    <>
      {/* Phone and tablet: one scrolling row. `-mx-5 px-5` lets the row bleed to the
          screen edges so the last chip does not look clipped mid-scroll. */}
      <nav
        aria-label={resolve("host.editor.nav_label", "Listing sections").text}
        className="-mx-4 flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2.5 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        {EDITOR_SECTIONS.map((section) => {
          const label = resolve(section.key, section.source);
          const active = section.slug === current;
          return (
            <Link
              key={section.slug}
              href={`/host/v2/listings/${listingId}/${section.slug}`}
              aria-current={active ? "page" : undefined}
              translate={label.translated ? "no" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {label.text}
              {done.has(section.slug) && !active && (
                <Check className="size-3 text-emerald-600" aria-hidden />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Desktop rail. */}
      <nav
        aria-label={resolve("host.editor.nav_label", "Listing sections").text}
        className="hidden w-52 shrink-0 flex-col border-r border-slate-100 py-4 pr-4 lg:flex lg:min-h-0"
      >
        {/* The list scrolls, the progress line does not: on a short laptop screen ten
            sections plus the footer overflow the frame, and the thing that gets clipped
            should never be the summary of what is left to do. */}
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {EDITOR_SECTIONS.map((section, index) => {
            const label = resolve(section.key, section.source);
            const active = section.slug === current;
            return (
              <li key={section.slug} className={section.group === "calendar" && EDITOR_SECTIONS[index - 1]?.group !== "calendar" ? "mt-5 border-t border-slate-100 pt-4" : undefined}>
                {section.group === "calendar" && EDITOR_SECTIONS[index - 1]?.group !== "calendar" && (
                  <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {resolve("host.editor.calendar_settings", "Calendar settings").text}
                  </p>
                )}
                <Link
                  href={`/host/v2/listings/${listingId}/${section.slug}`}
                  aria-current={active ? "page" : undefined}
                  translate={label.translated ? "no" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-slate-100 font-medium text-slate-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{label.text}</span>
                  {/* Only completion is marked. A dot on every unfinished row would put
                      ten indicators on screen to say nothing. */}
                  {done.has(section.slug) && (
                    <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

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
