"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { LayoutGrid, Map as MapIcon, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertiesMap, type MapPin } from "@/components/marketplace/properties-map";
import { useI18n } from "@/lib/i18n/client";
import {
  isViewMode,
  readStoredView,
  setActiveHomeListingsView,
  subscribeToStoredView,
  writeStoredView,
  type HomeListingsViewMode,
} from "@/components/public/home-listings-view-store";

export type { HomeListingsViewMode };

/**
 * Heading row for the home page's listing section, with the layout switcher sitting on
 * the same line to its right. `compact` and `detailed` are rendered on the server and
 * handed in as children — the cards stay server components, only the choice is client
 * state.
 */
export function HomeListingsView({
  heading,
  compact,
  detailed,
  footer,
  mapSearch,
  pins,
  defaultView = "compact",
}: {
  heading: ReactNode;
  compact: ReactNode;
  detailed: ReactNode;
  /** Rendered under the cards — hidden in map view, where it would float over nothing. */
  footer?: ReactNode;
  /** The compact search, floated over the map. Map view swallows the hero, so this is
   *  where the search someone was about to use has to reappear. */
  mapSearch?: ReactNode;
  pins: MapPin[];
  defaultView?: HomeListingsViewMode;
}) {
  const i18n = useI18n();
  const mapAvailable = pins.length > 0;

  // localStorage is the state, not a copy of it. The server snapshot is `null` so the
  // first client render matches the markup React is hydrating; the stored preference
  // lands on the re-render immediately after.
  const stored = useSyncExternalStore(
    subscribeToStoredView,
    readStoredView,
    () => null,
  );
  const view = isViewMode(stored, mapAvailable) ? stored : defaultView;

  // Map view takes over the page, not just this section: the hero steps aside and the
  // floating search takes its place over the map. Neither of those components can work
  // this out for itself, so publish the resolved mode for them.
  useEffect(() => {
    setActiveHomeListingsView(view);
    return () => setActiveHomeListingsView("compact");
  }, [view]);

  const options = [
    {
      mode: "compact" as const,
      icon: LayoutGrid,
      label: i18n.resolve("home.view_compact", "Compact"),
    },
    {
      mode: "detailed" as const,
      icon: Rows3,
      label: i18n.resolve("home.view_detailed", "Detailed"),
    },
    ...(mapAvailable
      ? [
          {
            mode: "map" as const,
            icon: MapIcon,
            label: i18n.resolve("home.view_map", "Map"),
          },
        ]
      : []),
  ];

  const isMap = view === "map";

  const switcher = (
    <div
      role="group"
      aria-label={i18n.resolve("home.view_switcher", "Choose a layout").text}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-background p-0.5",
        // Over the map it is no longer sitting on the page background, so it needs to
        // lift off the tiles the way the map's own controls do — and to opt back into
        // pointer events, which the overlay around it switches off.
        isMap &&
          "pointer-events-auto shadow-[0_4px_16px_rgba(15,23,42,0.18)]",
      )}
    >
      {options.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          type="button"
          onClick={() => writeStoredView(mode)}
          aria-pressed={view === mode}
          aria-label={label.text}
          title={label.text}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3",
            view === mode
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span
            className={cn("hidden sm:inline", label.translated && "notranslate")}
          >
            {label.text}
          </span>
        </button>
      ))}
    </div>
  );

  if (isMap) {
    return (
      <div className="relative">
        {/* Roughly the height the hero gives up, so the map reads as the page rather
            than as a panel on it. A stated height, not `70vh`: viewport units inside
            the layout's `zoom: 0.9` resolve against the unzoomed viewport and then
            render at 90%, which makes them lie about how tall the map looks. */}
        <PropertiesMap pins={pins} className="h-[32rem] md:h-[50rem]" />

        {/* Above the map's own controls (z-1000) and its markers. Transparent to the
            pointer except on the controls themselves, so the map still drags. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1001] flex flex-col gap-3 p-3 md:p-4">
          {/* Clears the map's expand button, which sits at the top right, on the
              narrow screens where the search would otherwise run under it. */}
          <div className="flex justify-center pr-11 md:pr-0">{mapSearch}</div>
          <div className="flex justify-end">{switcher}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base md:text-lg font-semibold tracking-tight">
          {heading}
        </h2>
        {switcher}
      </div>

      {view === "detailed" ? detailed : compact}
      {footer}
    </>
  );
}
