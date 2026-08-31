import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FixedStayPeriodState } from "./periods";

/**
 * The mockup's visual language, in one file.
 *
 * White surfaces on the product's own white page — `--background` is `#ffffff` and the
 * host shell is `bg-white`, so a card here has no tint to stand out against.
 *
 * That is what decides the resting edge. A shadow alone is nearly invisible white-on-
 * white, so each surface carries a hairline ring at rest and lets the shadow do the
 * lifting on hover and selection: present enough to read as an object, far too light to
 * read as the frame-around-everything this design is trying to avoid. It is also what
 * Airbnb does — their cards are white on white with a hairline, and depth arrives only
 * when you reach for one.
 *
 * Three steps and no more: at rest, under the pointer, chosen.
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

/** A field the host types or picks into, wearing the same skin as everything else. */
export const FIELD_CONTROL =
  "h-14 w-full max-w-none rounded-2xl border-transparent bg-white px-4 text-[0.9375rem] text-slate-950 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all hover:border-transparent hover:ring-slate-300 focus-visible:ring-2 focus-visible:ring-slate-900";

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
  level?: 3 | 4;
}) {
  const Heading = level === 3 ? "h3" : "h4";

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

/** Small, quiet, above the thing it names. */
export function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 block text-[0.8125rem] font-medium text-slate-500"
    >
      {children}
    </label>
  );
}

/** A section of the page: a heading, an optional sentence, and its content. */
export function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-[1.375rem] font-semibold tracking-[-0.02em] text-slate-950">
          {title}
        </h2>
        {aside}
      </div>
      {description ? (
        <p className="-mt-3 max-w-prose text-[0.9375rem] leading-6 text-slate-500">
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A row of mutually exclusive choices, as one floating pill.
 *
 * The lighter of the two selection shapes here, for a question whose answer only
 * changes what the host sees next — the big card choices are kept for answers that
 * change what a guest can do.
 */
export function PillChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex w-full gap-1 rounded-full p-1 sm:w-auto", CARD)}
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
              "min-h-11 flex-1 rounded-full px-5 text-[0.9375rem] font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
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
        "focus-within:ring-2 focus-within:ring-slate-900/30",
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
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 p-5">
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
          <span className="block font-heading text-[1.0625rem] font-semibold text-slate-950">
            {title}
          </span>
          <span className="mt-1 block text-[0.875rem] leading-5 text-slate-500">
            {hint}
          </span>
        </span>
      </label>
    </div>
  );
}
