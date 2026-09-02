import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FixedStayPeriodState } from "./periods";

/**
 * The mockup's shared visual language, in one file.
 *
 * White surfaces on the product's own white page — `--background` is `#ffffff` and the
 * guest listing is white too, so a card here has no tint to stand out against.
 *
 * That is what decides the resting edge. A shadow alone is nearly invisible white-on-
 * white, so each surface carries a hairline ring at rest and lets the shadow do the
 * lifting on hover and selection: present enough to read as an object, far too light to
 * read as the frame-around-everything this design is trying to avoid. It is also what
 * Airbnb does — their cards are white on white with a hairline, and depth arrives only
 * when you reach for one.
 *
 * Three steps and no more: at rest, under the pointer, chosen.
 *
 * **The cards are the guest's half.** The host half now lives inside the Calendar's
 * 23rem editing panel, whose own vocabulary is tinted blocks and separators rather than
 * elevation — see `host-panel.tsx`. What the two halves still share is here: the state
 * badges, the month headings, and the two selection controls, sized to fit the panel.
 */

/** A surface at rest. A hairline and almost no shadow — it separates, it does not enclose. */
export const CARD =
  "rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.03)]";

/** The same surface when the whole thing is a control. Depth arrives on approach. */
export const CARD_PRESSABLE = cn(
  CARD,
  "cursor-pointer transition-all duration-150 motion-reduce:transition-none",
  "hover:ring-slate-300 hover:shadow-[0_2px_6px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)]",
);

/** Chosen. The ring goes dark and thick — the one state that must read from across
 *  the page, which a heavier shadow alone never does. */
export const CARD_SELECTED =
  "ring-2 ring-slate-900 shadow-[0_2px_6px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)]";

/**
 * A field the host types or picks into, inside the panel.
 *
 * It is the date picker's own skin — `h-11`, `rounded-xl`, full width — restated so the
 * select beside it matches, since the select is `w-fit` and drops to `h-8` at `md` and
 * would otherwise sit in the same column at a different size.
 *
 * No border colour: the date picker owns that one, and it is how the field turns rose
 * when the value is refused. A class here would win the merge and take the invalid
 * state with it. The select states its own beside this one instead.
 */
export const FIELD_CONTROL =
  "mt-0 h-11 w-full max-w-none rounded-xl bg-white px-3 text-sm text-slate-950";

/**
 * The words a stay's state is told in, taken from the product rather than invented.
 *
 * `Booked`, `Blocked`, `Hidden` and `Past` are all terms this host already meets — the
 * first two in the calendar's own legend, `Hidden` on the listing visibility control,
 * `Past` on a calendar day that has gone by. Naming the same states differently here
 * would teach a second vocabulary for one set of facts.
 *
 * A guest is told less, and deliberately: the calendar's legend already argues that a
 * night held by a booking and a night held by a connected calendar are "the same answer
 * to the only question this grid is scanned for — the night is gone". `Blocked` is
 * host-speak for the host's own reasons; a guest gets `Unavailable`.
 *
 * The one colour is the light blue the calendar already fills a booked day with. There
 * is no green anywhere: it is not part of this palette.
 */
const BOOKED_CHIP = "border-transparent bg-[#e6f1fb] text-[#185fa5]";

export function StateBadge({
  state,
  audience,
}: {
  state: FixedStayPeriodState;
  audience: "host" | "guest";
}) {
  if (state === "AVAILABLE") return null;
  if (state === "BOOKED") {
    return <Badge className={BOOKED_CHIP}>Booked</Badge>;
  }
  if (state === "DATES_TAKEN") {
    return audience === "host" ? (
      <Badge variant="outline">
        <Lock aria-hidden />
        Blocked
      </Badge>
    ) : (
      <Badge variant="outline">Unavailable</Badge>
    );
  }
  // Neither of the last two ever reaches a guest — the server does not send them.
  return <Badge variant="outline">{state === "DISABLED" ? "Hidden" : "Past"}</Badge>;
}

/**
 * The month a run of stays belongs to.
 *
 * A season is fifteen to thirty rows and every one of them opens with a weekday and a
 * month name, so an undivided list gives the eye nothing to navigate by. The heading is
 * what makes "have I covered August?" answerable at a glance instead of by reading.
 */
export function MonthHeading({
  children,
  count,
  level = 4,
}: {
  children: React.ReactNode;
  count?: number;
  level?: 3 | 4 | 5;
}) {
  const Heading = level === 3 ? "h3" : level === 4 ? "h4" : "h5";

  return (
    <div className="flex items-baseline gap-2 pt-2 pb-1 first:pt-0">
      <Heading className="text-[0.8125rem] font-semibold tracking-wide text-slate-500 uppercase">
        {children}
      </Heading>
      {count !== undefined ? (
        <span className="text-[0.8125rem] text-slate-400">
          {count} {count === 1 ? "stay" : "stays"}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A row of mutually exclusive choices, as one floating pill.
 *
 * The lighter of the two selection shapes here, for a question whose answer only
 * changes what the host sees next — the big card choices are kept for answers that
 * change what a guest can do.
 *
 * `compact` is what lets three of these sit across a 23rem panel without the row
 * deciding to scroll sideways: the same control, on the panel's own type scale.
 */
export function PillChoice<T extends string>({
  label,
  value,
  options,
  compact = false,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  compact?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex w-full gap-1 rounded-full p-1", CARD)}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-full font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
              compact ? "px-2 text-[0.8125rem]" : "px-5 text-[0.9375rem]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
              selected
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One answer in a radio group, as a whole pressable card.
 *
 * A native radio underneath, kept `sr-only`, so arrow keys move between the answers and
 * the group is announced as one question — the card is the skin, never the mechanism.
 *
 * Sized for the panel it now lives in: the two answers stack in a 23rem column, so the
 * padding and the type each came down a step.
 */
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  icon,
  title,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  icon?: React.ReactNode;
  title: string;
  hint: string;
}) {
  const id = `${name}-${value}`;
  return (
    <div
      className={cn(
        CARD_PRESSABLE,
        "rounded-xl focus-within:ring-2 focus-within:ring-slate-900/30",
        checked && CARD_SELECTED,
      )}
    >
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 p-3">
        {icon ? (
          <span
            className={cn(
              "mt-0.5 shrink-0",
              checked ? "text-slate-900" : "text-slate-400",
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block text-[0.875rem] font-semibold text-slate-950">
            {title}
          </span>
          <span className="mt-0.5 block text-[0.75rem] leading-4 text-slate-500">
            {hint}
          </span>
        </span>
      </label>
    </div>
  );
}
