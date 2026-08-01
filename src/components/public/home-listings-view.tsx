"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { LayoutGrid, Map as MapIcon, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertiesMap, type MapPin } from "@/components/marketplace/properties-map";
import { useI18n } from "@/lib/i18n/client";

export type HomeListingsViewMode = "compact" | "detailed" | "map";

/** Survives navigation and reloads so the choice reads as a preference rather than a
 * per-visit toggle. Deliberately not in the URL: the home page has no other query
 * state and a shared link shouldn't carry someone else's layout taste. */
const STORAGE_KEY = "home:listings-view";

function isViewMode(
  value: string | null,
  mapAvailable: boolean,
): value is HomeListingsViewMode {
  if (value === "compact" || value === "detailed") return true;
  return mapAvailable && value === "map";
}

/** `storage` events only reach *other* tabs, so a same-tab write has to notify
 * subscribers itself. */
const storeListeners = new Set<() => void>();

function subscribeToStoredView(onChange: () => void) {
  storeListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    storeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Returns a plain string, so React's identity check over successive snapshots is
 * stable without any caching of our own. Storage can be unavailable (private mode,
 * blocked cookies) — then there is simply no stored preference. */
function readStoredView(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredView(mode: HomeListingsViewMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Preference just won't persist; notifying below still switches the view.
  }
  for (const listener of storeListeners) listener();
}

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
  pins,
  defaultView = "compact",
}: {
  heading: ReactNode;
  compact: ReactNode;
  detailed: ReactNode;
  /** Rendered under the cards — hidden in map view, where it would float over nothing. */
  footer?: ReactNode;
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

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base md:text-lg font-semibold tracking-tight">
          {heading}
        </h2>
        <div
          role="group"
          aria-label={i18n.resolve("home.view_switcher", "Choose a layout").text}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-background p-0.5"
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
      </div>

      {view === "map" ? (
        <PropertiesMap pins={pins} className="h-[70vh] min-h-[420px]" />
      ) : (
        <>
          {view === "detailed" ? detailed : compact}
          {footer}
        </>
      )}
    </>
  );
}
