"use client";

import Link from "next/link";
import { ArrowLeft, CircleHelp } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HostHeaderPortal } from "@/components/host/host-header-portal";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * On phones the calendar owns the whole screen: the bottom nav already says which
 * lens you are on, so the page's own title bar and tabs are dropped and only these
 * two controls survive, up in the shell header beside the language widget.
 */
export function CalendarHeaderActions({
  heading,
  help,
}: {
  heading: string;
  help: string[];
}) {
  const { resolve } = useI18n();
  return (
    <HostHeaderPortal>
      <div className="flex items-center gap-1 md:hidden">
        <Link
          href="/host/listings"
          aria-label={resolve("host.calendar.back_to_listings", "Back to listings").text}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={
                interpolate(
                  resolve("host.calendar.help_label", "How {section} works"),
                  { section: heading.toLowerCase() },
                ).text
              }
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CircleHelp className="size-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-4">
            <p className="text-sm font-semibold">{heading}</p>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {help.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </HostHeaderPortal>
  );
}
