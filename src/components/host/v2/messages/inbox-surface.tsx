"use client";

import { cn } from "@/lib/utils";

/**
 * The one visual decision this surface makes, kept in one place.
 *
 * The inbox separates its panes with light and depth instead of lines: every card,
 * field and pane is white, floated on a soft shadow, with no border anywhere. Three
 * columns of bordered boxes would put four hairlines across a screen whose content is
 * already a list of boxes; a shadow says "this is a separate thing" without adding a
 * stroke to look at. The rest of the host panel draws hairlines because it lays out
 * rows in one plane — this page stacks planes, so it shades them.
 */

/** A pane: list column, thread column, reservation rail. */
export const PANE =
  "rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_30px_-14px_rgba(15,23,42,0.22)]";

/** A card sitting inside a pane — one shade shallower, so it reads as nested. */
export const CARD =
  "rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_-10px_rgba(15,23,42,0.18)]";

/** An input the host types into: composer, search. Same language, tighter. */
export const FIELD =
  "rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.24)]";

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9774f]";

/**
 * A person's picture.
 *
 * Deliberately a plain `img`: avatars arrive from whichever provider the account signed
 * in with, and those hosts are not in `next.config.ts`'s `remotePatterns` — the
 * optimizer would refuse them. At 28–48px there is nothing for it to optimize anyway.
 */
export function Avatar({
  name,
  image,
  className,
}: {
  name?: string | null;
  image?: string | null;
  className?: string;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-[0.8125rem] font-semibold text-slate-600",
        className
      )}
      aria-hidden
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
