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
            className={cn(
              // Over the map the labels have to clear the centred search, and they are
              // far wider in some languages than in English ("Компактен Детален Мапа").
              // Icons only until there is room for both.
              isMap ? "hidden lg:inline" : "hidden sm:inline",
              label.translated && "notranslate",
            )}
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
        {/* Fills the screen under the header, less a sliver of footer so the page
            still reads as scrollable. `--app-viewport-height` is 100dvh already
            divided by the route's zoom factor — plain viewport units are not scaled by
            `zoom` but the box sized with them is, so 100dvh renders short. The 13.5rem
            is the header (5), this section's padding (1.5 + 2), and the footer sliver
            (5). The floor keeps a very short window from producing a letterbox. */}
        <PropertiesMap
          pins={pins}
          expandable={false}
          className="h-[calc(var(--app-viewport-height)_-_13.5rem)] min-h-[24rem]"
        />

        {/* Both overlays sit above the map's markers (z-600) and controls (z-1000), and
            are transparent to the pointer except on the controls themselves, so the map
            still drags everywhere else. */}

        {/* Centred on the map, independent of the switcher — its width swings a lot
            between languages and must not drag the search off centre. */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1001] flex justify-center px-3 md:top-4 md:px-4">
          {mapSearch}
        </div>

        {/* Same line as the search on desktop, where `h-14` matches the collapsed
            search pill so the two line up; a bottom-centre pill on phones, where there
            is no room beside it. Expanding the search simply covers this. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[1001] flex justify-center px-3 md:bottom-auto md:top-4 md:h-14 md:items-center md:justify-end md:px-4">
          {switcher}
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
