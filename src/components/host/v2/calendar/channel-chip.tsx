"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { CalendarPlatform } from "@/lib/host/v2/calendar-feed-platform";

/**
 * Who is using a date, in fourteen pixels.
 *
 * Channels get a drawn monogram in their own colour rather than their real logo. The
 * marks are trademarks with brand rules attached, and at this size they reduce to a
 * coloured smudge anyway — a letter is legible, recognisable by colour, and ours to
 * put wherever it is needed. A feed whose URL matched no channel gets no chip at all;
 * its name, which the host typed, is the only honest thing to show.
 */

const CHANNELS: Record<CalendarPlatform, { letter: string; background: string }> = {
  AIRBNB: { letter: "A", background: "#e0484f" },
  BOOKING: { letter: "B", background: "#1b4b9e" },
  VRBO: { letter: "V", background: "#0f6e56" },
};

export function ChannelChip({
  platform,
  className,
}: {
  platform: CalendarPlatform;
  className?: string;
}) {
  const channel = CHANNELS[platform];
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-3.5 shrink-0 place-items-center rounded text-[0.5rem] font-bold text-white",
        className,
      )}
      style={{ background: channel.background }}
    >
      {channel.letter}
    </span>
  );
}

/**
 * A booking taken here, marked with this product's own symbol.
 *
 * The one place a real logo is right: it is ours, and "booked here" is the fact the
 * host most wants to pick out of a month.
 */
export function DirectBookingChip({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-3.5 shrink-0 place-items-center",
        className,
      )}
    >
      <Image
        src="/branding/linger-homes-symbol.svg"
        alt=""
        width={128}
        height={128}
        unoptimized
        className="size-3.5"
      />
    </span>
  );
}
