"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import {
  AMENITY_GRID_CLASS,
  AmenityPickerCard,
} from "@/components/host/v2/amenities/amenity-picker-card";
import { groupAmenitiesByCategory } from "@/lib/host/v2/amenity-groups";
import { useTypeToSearch } from "@/lib/hooks/use-type-to-search";
import {
  displayableAmenities,
  toggleAmenitySelection,
} from "@/lib/host/v2/amenity-picker";
import {
  filterAmenityGroups,
  popularAmenities,
  type AmenityChipFilter,
} from "@/lib/host/v2/amenity-onboarding";
import { Tx, useI18n } from "@/lib/i18n/client";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";
import { reviewHref, stepNextTarget } from "@/lib/host/v2/listing-flow-return";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

const CATALOG_PANEL_ID = "amenity-catalog-panel";

/**
 * The first screen of phase two: which amenities the place has.
 *
 * UI only, deliberately. Nothing is written and no draft exists yet — the selection lives
 * in local state and is dropped when the host leaves, exactly like the phase-one screens.
 *
 * The catalog, the tiles, the labels, the icons and the category order are all the ones
 * the listing editor uses. A host lands on a short "Popular amenities" picker first —
 * the full catalog is long, and most hosts only need a dozen or so common options — with
 * a "View all amenities" control that expands into the same grouped, searchable catalog
 * the editor offers.
 */
export function AmenitiesStep({
  propertyType,
  spaceType,
  returnToReview = false,
  catalog,
  initialSelectedIds = [],
  initialExpanded = false,
  initialSearch = "",
  initialChip = "all",
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Reached from the Review screen's "Edit". */
  returnToReview?: boolean;
  catalog: CatalogAmenity[];
  /** Test seam: the flow never arrives here with a selection. */
  initialSelectedIds?: string[];
  /** Test seam: the flow always arrives collapsed into "Popular amenities". */
  initialExpanded?: boolean;
  /** Test seam for the expanded view's search box. */
  initialSearch?: string;
  /** Test seam for the expanded view's category/selected chip. */
  initialChip?: AmenityChipFilter;
}) {
  const i18n = useI18n();
  const { data, save } = useHostStartDraft();
  const { resolve } = i18n;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(data.amenityIds ?? initialSelectedIds),
  );
  const [expanded, setExpanded] = useState(initialExpanded);
  const [search, setSearch] = useState(initialSearch);
  const searchRef = useRef<HTMLInputElement>(null);
  useTypeToSearch(searchRef);
  const [chip, setChip] = useState<AmenityChipFilter>(initialChip);
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  /** Where the CTA goes, and what it says: on to the next question, or back to the
   *  summary the host came from. */
  const { href: nextHref, label: nextLabel } = stepNextTarget(
    returnToReview,
    query,
    `/host/start/photos?${query}`,
  );

  const displayCatalog = useMemo(
    () => displayableAmenities(catalog, selected),
    [catalog, selected],
  );
  const popular = useMemo(() => popularAmenities(displayCatalog), [displayCatalog]);
  const groups = useMemo(
    () => groupAmenitiesByCategory(displayCatalog),
    [displayCatalog],
  );
  const visibleGroups = useMemo(
    () => filterAmenityGroups(groups, { chip, search, selected }),
    [groups, chip, search, selected],
  );

  // `i18n.plural(...)` rather than a destructured `plural`: the string extractor only
  // recognises the member-access form, so destructuring would silently drop these keys.
  const selectedCountLabel = i18n.plural(
    "host.v2.amenities.selected_count",
    selected.size,
    "{n} amenity selected",
    "{n} amenities selected",
  );

  function toggle(amenityId: string) {
    setSelected((current) => toggleAmenitySelection(current, amenityId));
  }

  function toggleExpanded() {
    setExpanded((current) => {
      // Collapsing back to "Popular" is a fresh start — a search or category filter
      // left behind would otherwise silently narrow the expanded view next time.
      if (current) {
        setSearch("");
        setChip("all");
      }
      return !current;
    });
  }

  function clearFilters() {
    setSearch("");
    setChip("all");
  }

  return (
    <>
      <main className="flex-1 px-5 pb-32 pt-6 md:px-8 md:pb-32 md:pt-10">
        <div className="mx-auto w-full max-w-[49rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem] md:whitespace-nowrap">
            <Tx
              k="host.v2.amenities.heading"
              source="Tell guests which amenities they’ll find at your place"
            />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx
              k="host.v2.amenities.hint"
              source="You can add more amenities after you publish your listing."
            />
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500" aria-live="polite">
            {selectedCountLabel.text}
          </p>

          {!expanded ? (
            <div className="mt-[clamp(1.25rem,3vh,2rem)]">
              <h2 className="mb-2.5 text-sm font-semibold text-slate-900">
                <Tx k="host.v2.amenities.popular_heading" source="Popular amenities" />
              </h2>
              <div className={AMENITY_GRID_CLASS}>
                {popular.map((amenity) => (
                  <AmenityPickerCard
                    key={amenity.id}
                    amenity={amenity}
                    checked={selected.has(amenity.id)}
                    onToggle={() => toggle(amenity.id)}
                  />
                ))}
              </div>
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  aria-expanded={false}
                  aria-controls={CATALOG_PANEL_ID}
                  onClick={toggleExpanded}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-800 outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                >
                  <Tx k="host.v2.amenities.view_all" source="View all amenities" />
                  <ChevronDown className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div id={CATALOG_PANEL_ID} className="mt-[clamp(1.25rem,3vh,2rem)]">
              <div className="sticky top-0 z-10 space-y-2.5 border-b border-slate-100 bg-white/95 pb-3 pt-1 backdrop-blur">
                <button
                  type="button"
                  aria-expanded={true}
                  aria-controls={CATALOG_PANEL_ID}
                  onClick={toggleExpanded}
                  className="inline-flex items-center gap-1 rounded-full text-sm font-semibold text-slate-600 outline-none transition-colors hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <ChevronUp className="size-4" aria-hidden />
                  <Tx k="host.v2.amenities.show_popular" source="Show popular only" />
                </button>

                <label className="relative block">
                  <span className="sr-only">
                    <Tx k="host.v2.amenities.search" source="Search amenities" />
                  </span>
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    ref={searchRef}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      resolve("host.v2.amenities.search", "Search amenities").text
                    }
                    className="h-10 w-full rounded-full bg-slate-100 pl-10 pr-10 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:bg-slate-200/70 focus:bg-white focus:ring-2 focus:ring-slate-300"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label={
                        resolve("host.v2.amenities.clear_search", "Clear search").text
                      }
                      className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </label>

                <div
                  role="group"
                  aria-label={
                    resolve("host.v2.amenities.filter_label", "Filter amenities").text
                  }
                  className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
                >
                  <AmenityChipButton active={chip === "all"} onClick={() => setChip("all")}>
                    <Tx k="host.v2.amenities.chip_all" source="All" />
                  </AmenityChipButton>
                  <AmenityChipButton
                    active={chip === "selected"}
                    count={selected.size}
                    onClick={() => setChip("selected")}
                  >
                    <Tx k="host.v2.amenities.chip_selected" source="Selected" />
                  </AmenityChipButton>
                  {groups.map((group) => (
                    <AmenityChipButton
                      key={group.category.id}
                      active={chip === group.category.id}
                      count={group.items.length}
                      translated={group.category.translated}
                      onClick={() => setChip(group.category.id)}
                    >
                      {group.category.label}
                    </AmenityChipButton>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                {visibleGroups.length > 0 ? (
                  <div className="space-y-6">
                    {visibleGroups.map((group) => (
                      <section
                        key={group.category.id}
                        aria-labelledby={`amenity-section-${group.category.id}`}
                      >
                        <h2
                          id={`amenity-section-${group.category.id}`}
                          className={cn(
                            "mb-2.5 text-sm font-semibold text-slate-900",
                            group.category.translated && "notranslate",
                          )}
                        >
                          {group.category.label}
                        </h2>
                        <div className={AMENITY_GRID_CLASS}>
                          {group.items.map((amenity) => (
                            <AmenityPickerCard
                              key={amenity.id}
                              amenity={amenity}
                              checked={selected.has(amenity.id)}
                              onToggle={() => toggle(amenity.id)}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400">
                      <Search className="size-5" aria-hidden />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-900">
                      <Tx k="host.v2.amenities.no_results" source="No amenities found" />
                    </p>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-2 rounded-full px-3 py-1.5 text-sm text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <Tx
                        k="host.v2.amenities.clear_filters"
                        source="Clear search and filters"
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <ListingFlowFooter
        nextHref={nextHref}
        backHref={returnToReview ? reviewHref(query) : `/host/start/phase-one-complete?${query}`}
        onNext={async () => {
          if (await save({ amenityIds: [...selected], currentStepId: "photos" })) {
            window.location.assign(nextHref);
          }
        }}
        phaseOneProgress={100}
        phaseTwoProgress={20}
        nextLabel={nextLabel}
      />
    </>
  );
}

function AmenityChipButton({
  active,
  count,
  translated,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  translated?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-3.5 text-sm font-medium text-slate-600 outline-none transition-colors hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-400",
        active && "bg-slate-950 text-white hover:text-white",
      )}
    >
      <span className={cn(translated && "notranslate")}>{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            "text-xs tabular-nums text-slate-400",
            active && "text-white/65",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
