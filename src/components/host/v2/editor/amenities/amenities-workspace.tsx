"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, EyeOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { amenityIcon } from "@/lib/amenities/icon-registry";
import { groupAmenitiesByCategory } from "@/lib/host/v2/amenity-groups";
import { setListingAmenities } from "@/lib/actions/listing-amenities.actions";
import { withSaveState } from "@/components/host/v2/editor/save-state";
import { SuggestMissingOption } from "@/components/host/suggest-missing-option";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";
import { Tx, useI18n } from "@/lib/i18n/client";

/** Long enough that ticking through a category is one save, short enough that a host who
 *  chooses one thing and closes the tab still sees "Saved" before they go. */
const AUTOSAVE_DELAY_MS = 700;

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
  const { resolve, plural } = useI18n();

  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedIds));
  /** The last selection the server confirmed — what an unsuccessful save reverts to. */
  const confirmed = useRef<string[]>(selectedIds);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<string[] | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const groups = useMemo(() => groupAmenitiesByCategory(catalog), [catalog]);
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
  const count = plural(
    "host.editor.amenities.selected_count",
    selected.size,
    "{n} amenity selected",
    "{n} amenities selected",
  );

  return (
    <div className="flex flex-1 flex-col gap-6 py-6">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">
          <Tx k="host.editor.section.amenities" source="Amenities" />
        </h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          <Tx
            k="host.editor.amenities.intro"
            source="Pick everything guests can actually use. Changes save on their own."
          />
        </p>
        <p
          className={cn("mt-1 text-sm text-slate-500", count.translated && "notranslate")}
          aria-live="polite"
        >
          {count.text}
        </p>
      </header>

      <div className="space-y-7">
        {groups.map((group) => (
          <section key={group.category.id}>
            <h2
              className={cn(
                "mb-2 text-sm font-semibold text-slate-900 md:mb-3",
                group.category.translated && "notranslate",
              )}
            >
              {group.category.label}
            </h2>
            {/* Sized off the container, not the viewport: the editor pane is narrower
                than the window, so viewport breakpoints put one card per row even where
                three fit. */}
            <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] md:gap-2.5">
              {group.items.map((amenity) => {
                const checked = selected.has(amenity.id);
                const Icon = amenityIcon(amenity.icon) ?? Sparkles;
                const isHidden = hidden.has(amenity.id);
                return (
                  <button
                    type="button"
                    key={amenity.id}
                    aria-pressed={checked}
                    onClick={() => toggle(amenity.id)}
                    className={cn(
                      // pr-7 keeps the label clear of the corner tick, and the label
                      // wraps rather than running off the card: translated amenity names
                      // are routinely twice the length of the English ones this grid was
                      // sized against.
                      "group relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border py-1.5 pl-2 pr-7 text-left transition-all md:min-h-16 md:gap-2.5 md:rounded-xl md:py-2.5 md:pl-3",
                      checked
                        ? "border-[#e0714a] bg-[#fdf1ea] text-slate-900 shadow-sm ring-1 ring-[#e0714a]/20"
                        : "border-slate-200 bg-white hover:border-[#e0714a]/40 hover:bg-slate-50 hover:shadow-sm",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors md:size-9 md:rounded-lg",
                        checked
                          ? "bg-[#e0714a] text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-[#fde7dc] group-hover:text-[#8f3d21]",
                      )}
                    >
                      <Icon className="size-4 md:size-[1.125rem]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block hyphens-auto break-words text-xs font-medium leading-snug md:text-[0.8125rem]",
                          amenity.translated && "notranslate",
                        )}
                      >
                        {amenity.label}
                      </span>
                      {isHidden && (
                        <span className="mt-0.5 flex items-center gap-1 text-[0.6875rem] leading-tight text-slate-500">
                          <EyeOff className="size-3 shrink-0" aria-hidden />
                          <span className={cn(hiddenLabel.translated && "notranslate")}>
                            {hiddenLabel.text}
                          </span>
                        </span>
                      )}
                    </span>
                    {checked && (
                      // A tick in the corner rather than a dot on the baseline: the dot
                      // sat in the text's row, so a wrapped label pushed it off the card.
                      <span
                        className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-[#e0714a] text-white"
                        aria-hidden
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SuggestMissingOption
          kind="AMENITY"
          listingId={listingId}
          label={
            resolve("host.form.suggest_amenity", "Don't see an amenity? Suggest it").text
          }
          placeholder={
            resolve("host.form.suggest_amenity_placeholder", "e.g. Rooftop terrace").text
          }
        />
      </div>
    </div>
  );
}
