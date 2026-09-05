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
import { readStoredValue, writeStoredValue } from "@/lib/browser-storage";
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
      ? "bg-[#0f172a]"
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

/**
 * The tick a multi-select surface puts in `RailItem.trailing`.
 *
 * Drawn rather than borrowed from a form control: a native checkbox beside a photo and
 * two lines of status is the one element on the card that would look like it came from
 * somewhere else. `locked` is the property whose calendar is on screen — always part of
 * the set, never something to argue with, so it is shown settled rather than disabled-
 * looking.
 */
export function RailCheckbox({
  checked,
  locked,
}: {
  checked: boolean;
  locked?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md border-[1.5px] transition-colors duration-150 motion-reduce:transition-none",
        checked
          ? "border-[#0f172a] bg-[#0f172a] text-white"
          : "border-slate-300 bg-white text-transparent",
        locked && "opacity-45",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}

export function RailCard({
  item,
  selected,
  compact,
  disabled,
  onSelect,
  anchor,
}: {
  item: RailItem;
  selected: boolean;
  compact: boolean;
  /** The card is showing a settled state and has nothing to toggle. */
  disabled?: boolean;
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
        disabled={disabled}
        aria-pressed={selected}
        aria-label={accessibleName}
        title={accessibleName}
        className={cn(
          "relative flex w-full shrink-0 justify-center rounded-xl p-1.5 transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
          selected
            ? "bg-[#f1f5f9]"
            : attention
              ? "bg-[#f8fafc]"
              : "hover:bg-slate-100/70",
          disabled && "cursor-default",
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
          {/* In the compact rail the card has no room for a trailing slot, so the
              tick rides the corner of the photo the tone dot does not use. */}
          {item.trailing ? (
            <span className="absolute -bottom-1 -left-1">{item.trailing}</span>
          ) : null}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={accessibleName}
      className={cn(
        // No borders at all: which card is selected and which one wants attention are
        // both said with a fill. An outlined card next to a tinted one gave the rail two
        // competing ways of marking the same thing, and eight of them made a grid.
        "flex w-full shrink-0 items-center gap-2.5 rounded-xl p-2 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
        selected
          ? "bg-[#f1f5f9]"
          : attention
            ? "bg-[#f8fafc] hover:bg-[#f1f5f9]"
            : "hover:bg-slate-100/70",
        disabled && "cursor-default",
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
                "mt-0.5 flex items-center gap-1 text-[0.6875rem] font-semibold leading-4 text-[#0f172a]",
                attention.label.translated && "notranslate",
              )}
            >
              <TriangleAlert className="size-3 shrink-0" aria-hidden />
              {attention.label.text}
            </span>
            <span
              className={cn(
                "block truncate text-[0.6875rem] leading-4 text-slate-500",
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
        <Check className="size-4 shrink-0 text-[#0f172a]" aria-hidden />
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
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
        compact && "justify-center p-1.5",
        selected ? "bg-[#f1f5f9]" : "hover:bg-slate-100/70",
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
 *
 * The store holds three states, not two. `defaultCompact` lets a surface start the rail
 * collapsed on a view where it has nothing to add — the all-listings overview already
 * names every property — while an explicit `"expanded"` still outranks that default and
 * follows the host across views. Without the third state a host who opened the rail on
 * the overview would have it close again on their next visit.
 */
export function useRailPreference(storageKey: string, defaultCompact = false) {
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

  // A browser refusing storage is not a reason to fail the rail — and this runs during
  // render, so it must not throw. See `lib/browser-storage.ts`.
  const read = useCallback(() => {
    const stored = readStoredValue(storageKey);
    if (stored === "compact") return true;
    if (stored === "expanded") return false;
    return defaultCompact;
  }, [defaultCompact, storageKey]);

  const serverSnapshot = useCallback(() => defaultCompact, [defaultCompact]);

  const compact = useSyncExternalStore(subscribe, read, serverSnapshot);

  const setCompact = useCallback(
    (next: boolean) => {
      // Losing the preference must not break the toggle itself.
      writeStoredValue(storageKey, next ? "compact" : "expanded");
      window.dispatchEvent(new Event(eventName));
    },
    [eventName, storageKey],
  );

  return [compact, setCompact] as const;
}

/**
 * The rail, temporarily answering a different question.
 *
 * Normally a card means "show me this one". While a surface is choosing several
 * properties to act on, the same card means "include this one" — so the cards toggle
 * instead of navigating, the portfolio card steps aside, and `lockedId` marks the
 * property already on screen, which is part of every set and cannot be argued out of
 * it. Nothing about the rail's shape changes, because the host is still reading the
 * same list of properties.
 */
export interface RailMultiSelect {
  checkedIds: string[];
  /** The property being shown. Always included, never togglable. */
  lockedId: string;
  onToggle: (id: string) => void;
  /** The mode's own controls, drawn above the list. */
  banner?: React.ReactNode;
}

export function EntityRail({
  heading,
  ariaLabel,
  items,
  allCard,
  selectedId,
  compact,
  multiSelect,
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
  /** Present only while the surface is choosing a set rather than one property. */
  multiSelect?: RailMultiSelect | null;
  onSelect: (id: string) => void;
  onToggleCompact: () => void;
  anchor?: string;
  selectedAnchor?: string;
}) {
  const i18n = useI18n();
  const toggleLabel = compact
    ? i18n.resolve("host.v2.calendar.rail_expand", "Expand property list")
    : i18n.resolve("host.v2.calendar.rail_collapse", "Collapse property list");
  const checked = new Set(multiSelect?.checkedIds ?? []);

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
          className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
        >
          {compact ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {multiSelect?.banner}

      {/* The rail is fixed; only its list of properties scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pb-1">
        {/* The portfolio card is a view, not a target. Offering it beside checkboxes
            would read as "all properties" and mean something else entirely. */}
        {allCard && !multiSelect ? (
          <AllEntitiesCard
            label={allCard.label}
            detail={allCard.detail}
            trailing={allCard.trailing}
            selected={selectedId === ALL_ENTITIES}
            compact={compact}
            onSelect={() => onSelect(ALL_ENTITIES)}
          />
        ) : null}
        {items.map((item) => {
          if (!multiSelect) {
            return (
              <RailCard
                key={item.id}
                item={item}
                compact={compact}
                selected={selectedId === item.id}
                onSelect={() => onSelect(item.id)}
                anchor={selectedAnchor}
              />
            );
          }
          const locked = item.id === multiSelect.lockedId;
          const isChecked = locked || checked.has(item.id);
          return (
            <RailCard
              key={item.id}
              item={{
                ...item,
                trailing: <RailCheckbox checked={isChecked} locked={locked} />,
              }}
              compact={compact}
              selected={isChecked}
              disabled={locked}
              onSelect={() => multiSelect.onToggle(item.id)}
              anchor={selectedAnchor}
            />
          );
        })}
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

/**
 * Choosing a *set* of properties on a phone, where there is no rail to tick.
 *
 * A sibling of the chooser rather than a mode inside it, and the reason is written into
 * the chooser above: it switches the pane on tap and closes, because an Apply button
 * there "can only ever confirm what was just tapped". That is right for a navigator and
 * wrong here — a set cannot tell when it is finished, so this one genuinely needs a way
 * to say so, and giving both behaviours to one component would have meant taking the
 * chooser's away from every other screen that uses it.
 *
 * Dismissing without pressing Done keeps whatever was ticked. Nothing here writes
 * anything; the set is an argument to an action the host has not pressed yet, so there
 * is no draft to lose and no discard prompt to raise.
 */
export function EntityMultiSelectSheet({
  open,
  title,
  subtitle,
  items,
  lockedId,
  checkedIds,
  selectAllLabel,
  clearLabel,
  doneLabel,
  onToggle,
  onSelectAll,
  onClearExtras,
  onOpenChange,
  anchor,
}: {
  open: boolean;
  title: RailLine;
  /** The dates the set is being chosen for. Never let it be chosen blind. */
  subtitle?: RailLine | null;
  items: RailItem[];
  lockedId: string;
  checkedIds: string[];
  selectAllLabel: string;
  clearLabel: string;
  /** Already carries its own count — the sheet does not add one. */
  doneLabel: string;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearExtras: () => void;
  onOpenChange: (open: boolean) => void;
  anchor?: string;
}) {
  const checked = new Set(checkedIds);
  const everyOneChecked = items.every(
    (item) => item.id === lockedId || checked.has(item.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="sheet"
        // Three rows rather than a flowing column: the list is the only thing that
        // scrolls, so Done stays on the glass whatever the portfolio's length.
        className="grid h-dvh max-h-none grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-none"
        {...(anchor ? { id: anchor, "data-linger-anchor": anchor } : {})}
      >
        <DialogHeader>
          <DialogTitle className={title.translated ? "notranslate" : undefined}>
            {title.text}
          </DialogTitle>
          {subtitle ? (
            <p
              className={cn(
                "text-[0.8125rem] leading-5 text-slate-500",
                subtitle.translated && "notranslate",
              )}
            >
              {subtitle.text}
            </p>
          ) : null}
        </DialogHeader>

        <div className="-mx-1 min-h-0 overflow-y-auto overscroll-contain px-1">
          <div className="flex justify-end pb-1">
            <button
              type="button"
              onClick={everyOneChecked ? onClearExtras : onSelectAll}
              className="min-h-9 rounded-lg px-2 text-[0.8125rem] font-semibold text-[#0f172a] underline underline-offset-2 transition-colors duration-150 hover:bg-slate-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
            >
              {everyOneChecked ? clearLabel : selectAllLabel}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => {
              const locked = item.id === lockedId;
              const isChecked = locked || checked.has(item.id);
              return (
                <RailCard
                  key={item.id}
                  item={{
                    ...item,
                    trailing: (
                      <RailCheckbox checked={isChecked} locked={locked} />
                    ),
                  }}
                  compact={false}
                  selected={isChecked}
                  disabled={locked}
                  onSelect={() => onToggle(item.id)}
                />
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#0f172a] px-4 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#1e293b] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
        >
          {doneLabel}
        </button>
      </DialogContent>
    </Dialog>
  );
}
