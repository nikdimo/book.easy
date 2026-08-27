"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EyeOff, LayoutGrid, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { amenityIcon } from "@/lib/amenities/icon-registry";
import { useTypeToSearch } from "@/lib/hooks/use-type-to-search";
import { amenityDisplayLabel } from "@/lib/amenities/presentation";
import {
  groupAmenitiesByCategory,
  type AmenityGroup,
} from "@/lib/host/v2/amenity-groups";
import { displayableAmenities } from "@/lib/host/v2/amenity-picker";
import {
  AMENITY_GRID_CLASS,
  AmenityPickerCard,
} from "@/components/host/v2/amenities/amenity-picker-card";
import { setListingAmenities } from "@/lib/actions/listing-amenities.actions";
import {
  EditorSideRail,
  EditorSideRailHeading,
} from "@/components/host/v2/editor/editor-side-rail";
import { withSaveState } from "@/components/host/v2/editor/save-state";
import { SuggestMissingOption } from "@/components/host/suggest-missing-option";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";
import { Tx, useI18n } from "@/lib/i18n/client";

/** Long enough that ticking through a category is one save, short enough that a host who
 *  chooses one thing and closes the tab still sees "Saved" before they go. */
const AUTOSAVE_DELAY_MS = 700;

type AmenityFilter = "all" | "selected" | "unselected";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((id) => other.has(id));
}

/**
 * The Amenities workspace.
 *
 * Local state is authoritative while the host works: a tap flips the card immediately and
 * the save follows on a debounce, so a run down a category is one request rather than
 * twelve. The server's answer is the tiebreaker — if it rejects the write, the selection
 * snaps back to the last set it confirmed and says why, because a card left ticked over a
 * failed save is the one failure mode a host would never notice.
 */
export function AmenitiesWorkspace({
  listingId,
  catalog,
  selectedIds,
  hiddenSelectedIds,
}: {
  listingId: string;
  catalog: CatalogAmenity[];
  selectedIds: string[];
  /** Rows this listing holds that an admin has since hidden, or that were approved for
   *  this listing alone. Marked in the picker so a host is not left wondering why one
   *  amenity is not in anybody else's list. */
  hiddenSelectedIds: string[];
}) {
  const i18n = useI18n();
  const { resolve } = i18n;

  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedIds));
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useTypeToSearch(searchRef);
  const [filter, setFilter] = useState<AmenityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  /** The last selection the server confirmed — what an unsuccessful save reverts to. */
  const confirmed = useRef<string[]>(selectedIds);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<string[] | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const displayCatalog = useMemo(
    () => displayableAmenities(catalog, selected),
    [catalog, selected],
  );
  const groups = useMemo(
    () => groupAmenitiesByCategory(displayCatalog),
    [displayCatalog],
  );
  const hidden = useMemo(() => new Set(hiddenSelectedIds), [hiddenSelectedIds]);

  const flush = useCallback(
    async () => {
      // Only one replacement write may be in flight. If two race, the slower older
      // selection can otherwise become the final database state.
      if (saving.current) return;
      const ids = queued.current;
      if (!ids || sameSet(ids, confirmed.current)) {
        queued.current = null;
        return;
      }

      queued.current = null;
      saving.current = true;
      try {
        const result = await withSaveState(() => setListingAmenities(listingId, ids));
        if (result.error) {
          if (mounted.current) toast.error(result.error);
          // Only roll back if nothing newer is already on its way; otherwise the revert
          // would undo a choice the host made while this request was in flight.
          if (mounted.current && queued.current === null) {
            setSelected(new Set(confirmed.current));
          }
          return;
        }
        confirmed.current = result.selectedIds ?? ids;
      } catch {
        if (mounted.current) {
          toast.error(
            resolve(
              "host.editor.amenities.save_failed",
              "We couldn't save those amenities. Check your connection and try again.",
            ).text,
          );
          if (queued.current === null) setSelected(new Set(confirmed.current));
        }
      } finally {
        saving.current = false;
        if (queued.current && !sameSet(queued.current, confirmed.current)) {
          void flushRef.current();
        }
      }
    },
    [listingId, resolve],
  );

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(
    (ids: string[]) => {
      queued.current = ids;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flushRef.current();
      }, AUTOSAVE_DELAY_MS);
    },
    [],
  );

  // Leaving the section must not drop the last few taps, so an armed timer fires now
  // rather than dying with the component.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void flushRef.current();
    };
  }, []);

  function toggle(amenityId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(amenityId)) next.delete(amenityId);
      else next.add(amenityId);
      schedule([...next]);
      return next;
    });
  }

  const hiddenLabel = resolve(
    "host.editor.amenities.hidden_hint",
    "Not offered to other listings",
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = useMemo(
    () =>
      groups
        .filter(
          (group) => categoryFilter === null || group.category.id === categoryFilter,
        )
        .map((group) => {
          const selectedCount = group.items.filter((amenity) =>
            selected.has(amenity.id),
          ).length;
          const categoryMatches =
            normalizedQuery.length > 0 &&
            [group.category.label, group.category.name].some((value) =>
              value.toLocaleLowerCase().includes(normalizedQuery),
            );
          const items = group.items.filter((amenity) => {
            const checked = selected.has(amenity.id);
            if (filter === "selected" && !checked) return false;
            if (filter === "unselected" && checked) return false;
            if (!normalizedQuery || categoryMatches) return true;
            return [amenityDisplayLabel(amenity), amenity.label, amenity.name].some(
              (value) => value.toLocaleLowerCase().includes(normalizedQuery),
            );
          });
          return { ...group, items, selectedCount, totalCount: group.items.length };
        })
        .filter((group) => group.items.length > 0),
    [categoryFilter, filter, groups, normalizedQuery, selected],
  );
  const visibleCount = visibleGroups.reduce((total, group) => total + group.items.length, 0);
  const unselectedCount = Math.max(0, displayCatalog.length - selected.size);
  const visibleCountLabel = i18n.plural(
    "host.editor.amenities.visible_count",
    visibleCount,
    "{n} amenity shown",
    "{n} amenities shown",
  );

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setCategoryFilter(null);
  }

  return (
    <div className="flex flex-1 flex-col pb-6">
      <h1 className="sr-only">
        <Tx k="host.editor.section.amenities" source="Amenities" />
      </h1>

      <div className="sticky top-14 z-10 -mx-1 flex items-center bg-white/95 px-1 py-3 backdrop-blur lg:top-0">
        <div className="flex min-w-0 flex-1 flex-col gap-2 xl:pr-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">
              <Tx k="host.editor.amenities.search" source="Search amenities" />
            </span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={resolve(
                "host.editor.amenities.search",
                "Search amenities",
              ).text}
              className="h-10 w-full rounded-full bg-slate-100 pl-10 pr-10 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:bg-slate-200/70 focus:bg-white focus:ring-2 focus:ring-slate-300"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={resolve(
                  "host.editor.amenities.clear_search",
                  "Clear search",
                ).text}
                className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </label>

          <div
            role="group"
            aria-label={resolve(
              "host.editor.amenities.filter_label",
              "Filter amenities",
            ).text}
            className="flex self-start rounded-full bg-slate-100 p-0.5 sm:ml-auto sm:self-auto"
          >
            <FilterButton
              active={filter === "all"}
              count={displayCatalog.length}
              onClick={() => setFilter("all")}
            >
              <Tx k="host.editor.amenities.filter_all" source="All" />
            </FilterButton>
            <FilterButton
              active={filter === "selected"}
              count={selected.size}
              onClick={() => setFilter("selected")}
            >
              <Tx k="host.editor.amenities.filter_selected" source="Selected" />
            </FilterButton>
            <FilterButton
              active={filter === "unselected"}
              count={unselectedCount}
              onClick={() => setFilter("unselected")}
            >
              <Tx k="host.editor.amenities.filter_unselected" source="Not selected" />
            </FilterButton>
          </div>
        </div>

        <EditorSideRailHeading>
          <Tx k="host.editor.amenities.categories" source="Categories" />
        </EditorSideRailHeading>
      </div>

      <p className="sr-only" aria-live="polite">
        {visibleCountLabel.text}
      </p>

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
        {visibleGroups.length > 0 ? (
        <div className="space-y-6 pt-1">
          {visibleGroups.map((group) => (
            <section key={group.category.id}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2
                  className={cn(
                    "text-sm font-semibold text-slate-900",
                    group.category.translated && "notranslate",
                  )}
                >
                  {group.category.label}
                </h2>
                <span className="text-xs tabular-nums text-slate-400">
                  {group.selectedCount}/{group.totalCount}
                </span>
              </div>
              <div className={AMENITY_GRID_CLASS}>
                {group.items.map((amenity) => (
                  <AmenityPickerCard
                    key={amenity.id}
                    amenity={amenity}
                    checked={selected.has(amenity.id)}
                    onToggle={() => toggle(amenity.id)}
                    note={
                      hidden.has(amenity.id) ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[0.6875rem] leading-tight text-slate-500">
                          <EyeOff className="size-3 shrink-0" aria-hidden />
                          <span className={cn(hiddenLabel.translated && "notranslate")}>
                            {hiddenLabel.text}
                          </span>
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <div className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400">
            <Search className="size-5" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-900">
            <Tx k="host.editor.amenities.no_results" source="No amenities found" />
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 rounded-full px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Tx
              k="host.editor.amenities.clear_filters"
              source="Clear search and filters"
            />
          </button>
        </div>
        )}

          <div className="mt-7 pt-1">
            <SuggestMissingOption
              kind="AMENITY"
              listingId={listingId}
              label={
                resolve("host.form.suggest_amenity", "Don't see an amenity? Suggest it")
                  .text
              }
              placeholder={
                resolve("host.form.suggest_amenity_placeholder", "e.g. Rooftop terrace")
                  .text
              }
            />
          </div>
        </div>

        <AmenitiesCategoryRail
          groups={groups}
          selected={selected}
          activeCategoryId={categoryFilter}
          onFilter={setCategoryFilter}
        />
      </div>
    </div>
  );
}

function FilterButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-slate-500 outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400 sm:text-sm",
        active && "bg-slate-950 text-white shadow-sm hover:text-white",
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          "text-[0.6875rem] tabular-nums text-slate-400",
          active && "text-white/65",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function AmenitiesCategoryRail({
  groups,
  selected,
  activeCategoryId,
  onFilter,
}: {
  groups: AmenityGroup[];
  selected: ReadonlySet<string>;
  activeCategoryId: string | null;
  onFilter: (categoryId: string | null) => void;
}) {
  const { resolve } = useI18n();
  const totalCount = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <EditorSideRail
      label={resolve("host.editor.amenities.categories", "Categories").text}
    >
      <CategoryRailRow
        label={resolve("host.editor.amenities.all_categories", "All categories").text}
        count={`${selected.size}/${totalCount}`}
        active={activeCategoryId === null}
        icon={<LayoutGrid className="size-3.5" aria-hidden />}
        onClick={() => onFilter(null)}
      />

      {groups.map((group) => {
        const Icon = amenityIcon(group.category.icon) ?? Sparkles;
        const selectedCount = group.items.filter((amenity) =>
          selected.has(amenity.id),
        ).length;
        const active = activeCategoryId === group.category.id;
        return (
          <CategoryRailRow
            key={group.category.id}
            label={group.category.label}
            translated={group.category.translated}
            count={`${selectedCount}/${group.items.length}`}
            active={active}
            icon={<Icon className="size-3.5" aria-hidden />}
            onClick={() => onFilter(active ? null : group.category.id)}
          />
        );
      })}
    </EditorSideRail>
  );
}

function CategoryRailRow({
  label,
  count,
  active,
  translated = false,
  icon,
  onClick,
}: {
  label: string;
  count: string;
  active: boolean;
  translated?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 outline-none transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-400",
          active && "bg-slate-100 font-medium text-slate-950 hover:bg-slate-100",
        )}
      >
        <span
          className={cn(
            "shrink-0 text-slate-400",
            active && "text-slate-800",
          )}
        >
          {icon}
        </span>
        <span
          className={cn("min-w-0 flex-1 truncate", translated && "notranslate")}
          translate={translated ? "no" : undefined}
        >
          {label}
        </span>
        <span className="shrink-0 text-xs font-normal tabular-nums text-slate-400">
          {count}
        </span>
      </button>
    </li>
  );
}
