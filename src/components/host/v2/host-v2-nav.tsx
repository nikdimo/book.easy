"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  House,
  ListChecks,
  MessageCircle,
  NotebookTabs,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { translatedClass, useI18n } from "@/lib/i18n/client";

/*
 * The same five sections at both breakpoints. Account, language and the way back to the
 * booking site are not among them — they sit behind the avatar in the top right, which
 * both the phone and the desktop now carry.
 */
const destinations = [
  { href: "/host", id: "today", icon: House },
  { href: "/host/calendar", id: "calendar", icon: CalendarDays },
  { href: "/host/listings", id: "listings", icon: NotebookTabs },
  { href: "/host/reservations", id: "reservations", icon: ListChecks },
  { href: "/host/messages", id: "messages", icon: MessageCircle },
] as const;

function navigationLabel(
  resolve: ReturnType<typeof useI18n>["resolve"],
  id: (typeof destinations)[number]["id"],
) {
  switch (id) {
    case "today":
      return resolve("host.v2.nav.today", "Today");
    case "calendar":
      return resolve("host.v2.nav.calendar", "Calendar");
    case "listings":
      return resolve("host.v2.nav.listings", "Listings");
    case "reservations":
      return resolve("host.v2.nav.reservations", "Reservations");
    case "messages":
      return resolve("host.v2.nav.messages", "Messages");
  }
}

export function HostV2Nav() {
  const pathname = usePathname();
  const { resolve } = useI18n();

  return (
    /*
     * One component, two shapes. Below `md` it is the phone's fixed bottom bar —
     * icons, labels, and a darkened label under whichever section is open. From `md` up the
     * shell drops it into the header, where it becomes a plain row of full-height text
     * links whose active signal is an underline on the header's own hairline.
     *
     * Both mark the open section with the least ink that reads: the phone darkens the
     * one label, the header rules the one link. Neither tints, which is what a pill or
     * a coloured label did — a filled block on one of five items in a strip whose whole
     * job is to stay quiet.
     *
     * Both are rendered by the shell, each inside a wrapper that hides it at the other
     * breakpoint, so only one is ever visible.
     */
    <nav
      aria-label={resolve("host.v2.nav.label", "New host panel").text}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] md:static md:flex md:items-stretch md:gap-0 md:border-0 md:bg-transparent md:p-0"
    >
      {destinations.map((item) => {
        const active =
          item.href === "/host"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const label = navigationLabel(resolve, item.id);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl px-1 py-1.5 text-[10px] font-normal leading-[1.3] tracking-[0.01em] transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-400",
              // The desktop link is the full height of the header, so its bottom
              // border lands on the header's divider and reads as a tab underline.
              // `whitespace-nowrap` is what keeps five sections on one line at 768px
              // rather than wrapping and pushing the header past 64px.
              "md:h-full md:min-h-0 md:flex-row md:gap-0 md:whitespace-nowrap md:rounded-none md:border-b-2 md:px-2.5 md:py-0 md:text-[0.8125rem] md:font-medium lg:px-3 lg:text-sm",
              active
                ? "text-slate-950 md:border-slate-900 md:font-semibold md:text-slate-950"
                : "text-[#6a6a6a] hover:text-slate-950 md:border-transparent md:hover:border-slate-200 md:hover:bg-transparent",
            )}
          >
            {/* Icons belong to the phone bar, where a label alone is too small to aim
                at. In the header they cost roughly 130px of the width five centred
                sections are competing for, and earn nothing back.

                24px at a 1.5 stroke: the icon carries the target, the hairline keeps
                the whole bar quiet, and colour alone marks the open section — a rule
                above the active item was a second mark saying the same thing. */}
            <item.icon className="size-6 md:hidden" strokeWidth={1.5} aria-hidden />
            <span className={cn("max-w-full truncate", translatedClass(label))}>
              {label.text}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
