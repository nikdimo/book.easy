"use client";

import Link from "next/link";
import {
  ARRIVAL_GUIDE_SLUG,
  EDITOR_OVERVIEW_SLUG,
  editorSectionHref,
  type EditorHalf,
} from "@/lib/host/v2/editor-sections";
import { useI18n } from "@/lib/i18n/client";

/**
 * The editor's two halves, and the control that switches between them.
 *
 * A listing is two different things to its host: what they are selling, and what happens
 * once somebody has bought it. Airbnb splits the editor along exactly that line and puts
 * the split at the top, above everything else — and the important part is that the toggle
 * is on *both* halves. A switch that only exists on one side is not a switch; it is a
 * door out of one room with the way back hidden somewhere else.
 *
 * That was this editor's state for a while: the Arrival guide grew its own toggle, while
 * the way into it from the other side was still a row at the bottom of a nine-item rail.
 * Two doors to the same room, neither of which looked like the other. Now the toggle
 * wraps both halves — `EditorFrame` for "Your space", the Arrival guide route for the
 * other — and the Arrival guide is no longer a section in the rail at all.
 *
 * It is a `<nav>` of two links rather than a tablist: pressing "Your space" leaves this
 * page for another one, and telling a screen reader it is a tab would promise a panel that
 * is about to become a different document.
 */
export function EditorHalves({
  listingId,
  half,
  children,
}: {
  listingId: string;
  half: EditorHalf;
  children: React.ReactNode;
}) {
  const { resolve } = useI18n();

  return (
    // `editor-halves` carries the same Airbnb design tokens the Arrival guide uses, so the
    // toggle looks identical whichever half is under it — see globals.css.
    <div className="editor-halves mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col lg:min-h-0">
      <div className="shrink-0 px-4 pb-1 pt-4 sm:px-5 lg:px-6">
        <nav
          aria-label={
            resolve("host.editor.halves_label", "Listing editor sections").text
          }
          className="ag-segment inline-flex"
        >
          <Half
            href={editorSectionHref(listingId, EDITOR_OVERVIEW_SLUG)}
            current={half === "space"}
            label={resolve("host.editor.arrival.tab_space", "Your space").text}
          />
          <Half
            href={editorSectionHref(listingId, ARRIVAL_GUIDE_SLUG)}
            current={half === "arrival"}
            label={resolve("host.editor.arrival.tab_guide", "Arrival guide").text}
          />
        </nav>
      </div>
      {children}
    </div>
  );
}

/**
 * One half.
 *
 * The current one is a `<span>`, not a link to the page it is already on. "Your space" is
 * a whole half rather than a single page, so a host who is three sections deep and presses
 * it would otherwise be quietly thrown back to the overview — a navigation that looks like
 * a no-op and is not.
 */
function Half({
  href,
  current,
  label,
}: {
  href: string;
  current: boolean;
  label: string;
}) {
  if (current) {
    return (
      <span aria-current="page" className="ag-segment-option">
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="ag-segment-option">
      {label}
    </Link>
  );
}
