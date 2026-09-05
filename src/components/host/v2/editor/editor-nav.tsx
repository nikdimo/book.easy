"use client";

import Link from "next/link";
import { ChevronDown, CircleAlert } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EDITOR_NAV_GROUPS,
  EDITOR_NAV_ITEMS,
  type EditorNavItem,
} from "@/lib/host/v2/editor-sections";
import { resolveEditorLabel } from "@/lib/i18n/editor-label";
import { useI18n } from "@/lib/i18n/client";

/** How many chips the small-screen row shows before the rest go under "More".
 *  Three is what fits a 360px screen without the longest label wrapping. */
const VISIBLE_CHIPS = 3;

/**
 * The editor's small-screen navigation.
 *
 * Desktop has no rail any more: from `lg` up the left column is `EditorSpaceCards`, the
 * same column the Arrival guide draws, so switching halves no longer resizes the page. A
 * phone has no room for that column beside the pane, so it keeps this — a chip row that
 * does not scroll, because a scrolling row hides items behind a gesture with no
 * affordance and the last chip always looks clipped mid-word. The row shows a window of
 * items around the current one, and "More" holds the complete grouped list, so the menu
 * answers "what are all the parts of a listing" whichever one you happen to be on.
 *
 * `EDITOR_NAV_GROUPS` is the only place the order and the grouping live; nothing here
 * restates either.
 */
export function EditorNav({
  listingId,
  current,
  attention,
}: {
  listingId: string;
  current: string;
  /** Section slugs with an open task, from `editorAttentionSlugs`. */
  attention: string[];
}) {
  const t = useI18n();
  const { resolve } = t;
  const open = new Set(attention);

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
          const active = item.slug === current;
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
              {open.has(item.slug) && !active && (
                <CircleAlert className="size-3 shrink-0 text-amber-600" aria-hidden />
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
                  const active = item.slug === current;
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
                        {open.has(item.slug) && (
                          <CircleAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden />
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

    </>
  );
}
