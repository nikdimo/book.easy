"use client";

import { useCallback, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  Check,
  House,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The property column, as a shape rather than a screen.
 *
 * The calendar drew this first and the reservations panel needs the same thing beside
 * a different middle pane — same photos, same widths, same collapse behaviour, so a
 * host who learns to switch property on one screen has already learned the other. What
 * differs is only what each card *says* about a property: the calendar reports whether
 * it can be booked, reservations reports how much is on it. So the rail takes lines of
 * text it does not interpret, and each surface keeps ownership of its own vocabulary.
 *
 * Nothing here reaches for a listing type. Handing it a `RailItem` is the whole
 * contract.
 */

export const ALL_ENTITIES = "__all__";

/** A line of already-resolved copy. `translated` drives the `notranslate` guard. */
export interface RailLine {
  text: string;
  translated?: boolean;
}

export interface RailItem {
  id: string;
  title: string;
  photoUrl?: string | null;
  photoAlt?: string | null;
  /** The dot on the photo: teal, amber, or nothing much. */
  tone: "positive" | "warning" | "neutral";
  /**
   * Something the host has to deal with. Replaces `status` when present and turns the
   * card amber — a property is either fine, or it is the one asking for work.
   */
  attention?: { label: RailLine; detail: RailLine } | null;
  /** The ordinary two-line description shown when there is no attention. */
  status?: RailLine | null;
  /** Right-hand slot: a count, a check, whatever the surface needs. */
  trailing?: React.ReactNode;
}

function toneDotClass(tone: RailItem["tone"]): string {
  return tone === "positive"
    ? "bg-teal-500"
    : tone === "warning"
      ? "bg-amber-500"
      : "bg-slate-300";
}

function RailThumb({
  item,
  size,
}: {
  item: Pick<RailItem, "photoUrl" | "photoAlt" | "title">;
  size: number;
}) {
  if (!item.photoUrl) {
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"
        style={{ width: size, height: size }}
      >
        <House className="size-4" />
      </span>
    );
  }
  return (
    <Image
      src={item.photoUrl}
      alt={item.photoAlt || item.title}
      width={size}
      height={size}
      className="shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function RailCard({
  item,
  selected,
  compact,
  onSelect,
  anchor,
}: {
  item: RailItem;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
  /** Anchor id for the selected card, if the surface publishes one. */
  anchor?: string;
}) {
  const { attention, status } = item;
  // The full sentence stays in the accessible name even when the card shows the short
  // flag, so a screen reader is never told less than the panel would say.
  const accessibleName = attention
    ? `${item.title} — ${attention.label.text}. ${attention.detail.text}`
    : status
      ? `${item.title} — ${status.text}`
      : item.title;
  const anchorProps =
    selected && anchor ? { id: anchor, "data-linger-anchor": anchor } : {};

  if (compact) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={accessibleName}
        title={accessibleName}
        className={cn(
          "relative flex w-full shrink-0 justify-center rounded-xl p-1.5 transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
          selected
            ? "bg-[#ffe9dc]"
            : attention
              ? "bg-amber-50"
              : "hover:bg-slate-100/70",
        )}
        {...anchorProps}
      >
        <span className="relative">
          <RailThumb item={item} size={40} />
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-white",
              toneDotClass(item.tone),
            )}
          />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={accessibleName}
      className={cn(
        // No borders at all: which card is selected and which one wants attention are
        // both said with a fill. An outlined card next to a tinted one gave the rail two
        // competing ways of marking the same thing, and eight of them made a grid.
        "flex w-full shrink-0 items-center gap-2.5 rounded-xl p-2 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
        selected
          ? "bg-[#ffe9dc]"
          : attention
            ? "bg-amber-50 hover:bg-amber-100/70"
            : "hover:bg-slate-100/70",
      )}
      {...anchorProps}
    >
      <span className="relative">
        <RailThumb item={item} size={44} />
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-white",
            toneDotClass(item.tone),
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-semibold text-slate-900">
          {item.title}
        </span>
        {attention ? (
          <>
            <span
              className={cn(
                "mt-0.5 flex items-center gap-1 text-[0.6875rem] font-semibold leading-4 text-amber-800",
                attention.label.translated && "notranslate",
              )}
            >
              <TriangleAlert className="size-3 shrink-0" aria-hidden />
              {attention.label.text}
            </span>
            <span
              className={cn(
                "block truncate text-[0.6875rem] leading-4 text-amber-700",
                attention.detail.translated && "notranslate",
              )}
            >
              {attention.detail.text}
            </span>
          </>
        ) : status ? (
          <span
            className={cn(
              "mt-0.5 line-clamp-2 text-[0.6875rem] leading-4 text-slate-500",
              status.translated && "notranslate",
            )}
          >
            {status.text}
          </span>
        ) : null}
      </span>
      {item.trailing ?? (selected ? (
        <Check className="size-4 shrink-0 text-[#a94b28]" aria-hidden />
      ) : null)}
    </button>
  );
}

export function AllEntitiesCard({
  label,
  detail,
  selected,
  compact,
  trailing,
  onSelect,
  anchor,
}: {
  label: RailLine;
  /** The line under the label — a count, a total, whatever the surface counts. */
  detail?: RailLine | null;
  selected: boolean;
  compact: boolean;
  trailing?: React.ReactNode;
  onSelect: () => void;
  anchor?: string;
}) {
  const accessibleName = detail ? `${label.text} (${detail.text})` : label.text;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={accessibleName}
      title={compact ? accessibleName : undefined}
      className={cn(
        "flex w-full shrink-0 items-center gap-2.5 rounded-xl p-2 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
        compact && "justify-center p-1.5",
        selected ? "bg-[#ffe9dc]" : "hover:bg-slate-100/70",
      )}
      {...(anchor ? { id: anchor, "data-linger-anchor": anchor } : {})}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
        <LayoutGrid className="size-4" aria-hidden />
      </span>
      {compact ? null : (
        <>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-[0.8125rem] font-semibold text-slate-900",
                label.translated && "notranslate",
              )}
            >
              {label.text}
            </span>
            {detail ? (
              <span
                className={cn(
                  "mt-0.5 block truncate text-[0.6875rem] text-slate-500 tabular-nums",
                  detail.translated && "notranslate",
                )}
              >
                {detail.text}
              </span>
            ) : null}
          </span>
          {trailing}
        </>
      )}
    </button>
  );
}

/**
 * Whether the rail is collapsed is a preference of this browser, not a fact about the
 * property — it has no business in the database. `useSyncExternalStore` is how a
 * browser store is read without an effect that would write state during the first
 * render, and it gives the server a defined snapshot (expanded) so hydration has
 * nothing to argue with.
 *
 * Each surface passes its own key: collapsing the rail to read a month of the calendar
 * is not a statement about how the host wants to read their reservations.
 */
export function useRailPreference(storageKey: string) {
  const eventName = `bookeasy:host-rail:${storageKey}`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      window.addEventListener(eventName, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(eventName, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    [eventName],
  );

  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey) === "compact";
    } catch {
      // A browser refusing storage is not a reason to fail the rail.
      return false;
    }
  }, [storageKey]);

  const compact = useSyncExternalStore(subscribe, read, () => false);

  const setCompact = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(storageKey, next ? "compact" : "expanded");
      } catch {
        // Losing the preference must not break the toggle itself.
      }
      window.dispatchEvent(new Event(eventName));
    },
    [eventName, storageKey],
  );

  return [compact, setCompact] as const;
}

export function EntityRail({
  heading,
  ariaLabel,
  items,
  allCard,
  selectedId,
  compact,
  onSelect,
  onToggleCompact,
  anchor,
  selectedAnchor,
}: {
  heading: string;
  ariaLabel: string;
  items: RailItem[];
  /** The portfolio-wide card at the top, when the surface has one. */
  allCard?: {
    label: RailLine;
    detail?: RailLine | null;
    trailing?: React.ReactNode;
  } | null;
  selectedId: string;
  compact: boolean;
  onSelect: (id: string) => void;
  onToggleCompact: () => void;
  anchor?: string;
  selectedAnchor?: string;
}) {
  const i18n = useI18n();
  const toggleLabel = compact
    ? i18n.resolve("host.v2.calendar.rail_expand", "Expand property list")
    : i18n.resolve("host.v2.calendar.rail_collapse", "Collapse property list");

  return (
    <aside
      {...(anchor ? { id: anchor, "data-linger-anchor": anchor } : {})}
      aria-label={ariaLabel}
      className={cn(
        // No divider either. The gap between the rail and the pane beside it is enough
        // separation at this width, and a hairline was one more line on a screen whose
        // whole point is a grid of tiles.
        "hidden min-h-0 shrink-0 flex-col gap-2 md:flex md:pr-3 xl:pr-4",
        compact ? "w-[4.25rem]" : "w-[13.5rem] xl:w-[15rem]",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-1",
          compact && "justify-center",
        )}
      >
        {compact ? null : (
          <h2 className="flex-1 truncate px-1 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
            {heading}
          </h2>
        )}
        <button
          type="button"
          onClick={onToggleCompact}
          aria-label={toggleLabel.text}
          title={toggleLabel.text}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]"
        >
          {compact ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {/* The rail is fixed; only its list of properties scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pb-1">
        {allCard ? (
          <AllEntitiesCard
            label={allCard.label}
            detail={allCard.detail}
            trailing={allCard.trailing}
            selected={selectedId === ALL_ENTITIES}
            compact={compact}
            onSelect={() => onSelect(ALL_ENTITIES)}
          />
        ) : null}
        {items.map((item) => (
          <RailCard
            key={item.id}
            item={item}
            compact={compact}
            selected={selectedId === item.id}
            onSelect={() => onSelect(item.id)}
            anchor={selectedAnchor}
          />
        ))}
      </div>
    </aside>
  );
}

/**
 * Phones get a full-screen chooser instead of a permanent rail. It carries the same
 * photo, title and status as the desktop card — a row of photos and radio buttons
 * would make the host pick a property without being told what state it is in.
 */
export function EntityChooserSheet({
  open,
  title,
  items,
  allCard,
  selectedId,
  onSelect,
  onOpenChange,
  anchor,
}: {
  open: boolean;
  title: RailLine;
  items: RailItem[];
  allCard?: {
    label: RailLine;
    detail?: RailLine | null;
    trailing?: React.ReactNode;
  } | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  anchor?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="sheet"
        className="h-dvh max-h-none content-start gap-3 overflow-x-hidden overflow-y-auto rounded-none"
        {...(anchor ? { id: anchor, "data-linger-anchor": anchor } : {})}
      >
        <DialogHeader>
          <DialogTitle className={title.translated ? "notranslate" : undefined}>
            {title.text}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {allCard ? (
            <AllEntitiesCard
              label={allCard.label}
              detail={allCard.detail}
              trailing={allCard.trailing}
              selected={selectedId === ALL_ENTITIES}
              compact={false}
              onSelect={() => {
                onSelect(ALL_ENTITIES);
                onOpenChange(false);
              }}
            />
          ) : null}
          {items.map((item) => (
            <RailCard
              key={item.id}
              item={item}
              compact={false}
              selected={selectedId === item.id}
              onSelect={() => {
                // Selecting switches the pane there and then — an Apply button would
                // add a step that can only ever confirm what was just tapped.
                onSelect(item.id);
                onOpenChange(false);
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
