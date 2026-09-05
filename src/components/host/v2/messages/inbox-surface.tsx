"use client";

import { useState } from "react";
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
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]";

/**
 * A person's picture.
 *
 * Deliberately a plain `img`: avatars arrive from whichever provider the account signed
 * in with, and those hosts are not in `next.config.ts`'s `remotePatterns` — the
 * optimizer would refuse them. At 28–48px there is nothing for it to optimize anyway.
 *
 * The initial is the fallback for a picture that does not arrive, not only for one that
 * was never stored. `img-src` in the Content-Security-Policy allows Google's avatar host
 * and no other, so a picture from anywhere else is blocked before it paints — silently,
 * with no error the page can see other than the load failing. Treating that the same as
 * "no picture" is what keeps an empty grey circle from being the answer.
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
  // The URL that failed, rather than a boolean: a different person arriving in the same
  // slot deserves a fresh attempt at their own picture, and remembering *which* image
  // gave up derives that from the props instead of resetting a flag in an effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = image != null && failedUrl === image;

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-[0.8125rem] font-semibold text-slate-600",
        className
      )}
      aria-hidden
    >
      {image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedUrl(image)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
