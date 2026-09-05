"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert, ExternalLink } from "lucide-react";
import { EDITOR_SPACE_SECTIONS } from "@/lib/host/v2/editor-sections";
import { resolveEditorLabel } from "@/lib/i18n/editor-label";
import { useI18n } from "@/lib/i18n/client";

/**
 * The end of every editor section: where to go next, and the way out.
 *
 * The top navigation can only ever show a few sections at once, so the bottom of the
 * pane is where the whole list becomes visible at once — a host who has just finished
 * their photos is at the exact moment they want to see what else a listing needs, and
 * scrolling back up to a chip row does not tell them. The current section is left out;
 * the one thing the host demonstrably does not want next is the page they are on.
 */
export function EditorSectionFooter({
  listingId,
  current,
  attention,
  previewSlug,
}: {
  listingId: string;
  current: string;
  /** Section slugs with an open task — the same marks the rail carries. */
  attention: string[];
  previewSlug?: string;
}) {
  const { resolve } = useI18n();
  const open = new Set(attention);
  // The space half only. The Arrival guide is not one of the things a host picks
  // "next" from here any more — it is the other half of the editor, and the toggle
  // above is where it is reached from.
  const rest = EDITOR_SPACE_SECTIONS.filter((section) => section.slug !== current);

  return (
    <section className="mt-12 border-t border-slate-100 pt-6">
      {/* The list is hidden from `lg` up: the left column carries the same sections and is
          always on screen there, so this would be a second copy of it below the fold. On a
          phone the column is a three-chip window, and this is where the whole list becomes
          visible at once — a host who has just finished their photos is at the exact moment
          they want to see what else a listing needs. The actions underneath stay at every
          width. */}
      <h2 className="text-sm font-medium text-slate-900 lg:hidden">
        {resolve("host.editor.next_heading", "What would you like to edit next?").text}
      </h2>

      {/* A wrapping grid rather than a row: every section stays on screen, which is the
          whole point of repeating them down here. */}
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:hidden">
        {rest.map((section) => {
          const label = resolveEditorLabel({ resolve }, section.key, section.source);
          return (
            <li key={section.slug}>
              <Link
                href={`/host/listings/${listingId}/${section.slug}`}
                translate={label.translated ? "no" : undefined}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:bg-slate-50 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 truncate">{label.text}</span>
                {open.has(section.slug) && (
                  <CircleAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href="/host/listings"
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {resolve("host.editor.back_to_listings", "Back to listings").text}
        </Link>
        {previewSlug && (
          <Link
            href={`/properties/${previewSlug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none"
          >
            {resolve("host.editor.preview", "Preview").text}
            <ExternalLink className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}
