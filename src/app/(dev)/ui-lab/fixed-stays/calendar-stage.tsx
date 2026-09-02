"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { LISTING } from "./fixtures";

/**
 * The Calendar workspace, far enough for the panel inside it to be judged.
 *
 * The editing panel is the deliverable, and a panel reviewed on its own tells you
 * nothing about the two things reviewers most need to see: that it is 23rem wide on a
 * desktop with a month grid beside it, and that on a phone it is the whole screen with
 * its own way out. So the frame is real — the same `lg:w-[23rem] xl:w-[25rem]` right
 * column, the same border, the same one-flex-column-with-its-own-scroller arrangement
 * as `host-calendar-workspace.tsx` — and bounded in height, because "does a long season
 * scroll inside the panel" is not answerable on a page that simply grows.
 *
 * The month grid is *not* reproduced. Standing one in would mean either a fake grid a
 * reviewer can click on and learn nothing from, or the real one, which needs a listing,
 * an index and a selection model this prototype has no reason to own. What is here is
 * its footprint, said plainly.
 */
export function CalendarStage({
  children,
}: {
  children: (api: { closeSheet: () => void }) => React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // This is the real workspace drawer contract: lock the page behind it, move focus
  // to its first control, keep Tab inside it, close on Escape, and return focus to the
  // button that opened it. The mockup must not teach a keyboard user a weaker version
  // of the surface that will eventually contain this feature.
  useEffect(() => {
    if (!sheetOpen) return;

    const drawer = panelRef.current;
    if (!drawer) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const frame = window.requestAnimationFrame(() => {
      drawer.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!drawer.contains(document.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setSheetOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter(
        (element) =>
          element.offsetParent !== null && element.closest("[inert]") === null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [sheetOpen]);

  return (
    <div className="relative flex h-[40rem] max-h-[calc(100dvh-13rem)] min-h-[30rem] overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold text-slate-900">
            {LISTING.title}
          </p>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">July 2026</p>
        </div>

        <div aria-hidden className="grid shrink-0 grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, index) => (
            <span key={index} className="h-8 rounded-md bg-slate-100 sm:h-10" />
          ))}
        </div>

        <p className="text-[0.75rem] leading-4 text-slate-400">
          The month grid is the calendar&rsquo;s own and is not part of this mockup.
          Everything under review is in the editing panel.
        </p>

        {/* One line below `lg`, and always an action — the workspace's own way into the
            panel on a phone, where the panel is the screen rather than a column. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-auto flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-4 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#1e293b] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] lg:hidden"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Manage listing settings
        </button>
      </div>

      <aside
        ref={panelRef}
        role={sheetOpen ? "dialog" : undefined}
        aria-modal={sheetOpen ? true : undefined}
        aria-labelledby={sheetOpen ? "fixed-stays-panel-title" : undefined}
        aria-label={sheetOpen ? undefined : "Editing panel"}
        className={cn(
          "hidden",
          sheetOpen && "fixed inset-0 z-[45] flex h-dvh w-full flex-col bg-white",
          // Desktop: the same mounted tree becomes the fixed right pane.
          "lg:static lg:inset-auto lg:z-auto lg:flex lg:h-auto lg:min-h-0 lg:w-[23rem] lg:shrink-0 lg:flex-col lg:overflow-hidden lg:border-l lg:border-slate-100 lg:px-4 lg:py-4 xl:w-[25rem]",
        )}
      >
        <div
          className="flex min-h-0 flex-1 flex-col px-4 pt-3 outline-none lg:px-0 lg:pt-0"
          style={
            sheetOpen
              ? { paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }
              : undefined
          }
        >
          {children({ closeSheet: () => setSheetOpen(false) })}
        </div>
      </aside>
    </div>
  );
}
