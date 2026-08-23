"use client";

import Link from "next/link";
import { Copy, HousePlus, Plus, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n/client";

/**
 * The two ways a listing can start, offered wherever the overview says "add".
 *
 * Importing already existed — `/host/start/import`, reachable from the start dashboard —
 * but the overview's `+` went straight to `/host/start/new`, so a host who arrived at
 * their listings (which is where the panel drops them) never saw that pasting an Airbnb
 * link was an option at all. The choice therefore lives here, next to the button, rather
 * than one screen behind it.
 *
 * Hrefs are exported as data so navigation can be asserted without opening a Radix
 * portal, which a static render cannot do.
 */

export const HOST_START_NEW_HREF = "/host/start/new";
export const HOST_START_IMPORT_HREF = "/host/start/import";

export type AddListingAction = {
  key: "create" | "import";
  href: string;
  icon: LucideIcon;
  /** i18n key and English source; the start dashboard already ships these two labels. */
  labelKey: string;
  labelSource: string;
  hintKey?: string;
  hintSource?: string;
};

export const ADD_LISTING_ACTIONS: AddListingAction[] = [
  {
    key: "create",
    href: HOST_START_NEW_HREF,
    icon: HousePlus,
    labelKey: "host.v2.start_dashboard.create_new",
    labelSource: "Create a new listing",
  },
  {
    key: "import",
    href: HOST_START_IMPORT_HREF,
    icon: Copy,
    labelKey: "host.v2.listings.import_existing",
    labelSource: "Import an existing listing",
    hintKey: "host.v2.start_dashboard.create_existing_hint",
    hintSource: "Paste a link from Airbnb, Booking.com, Facebook and more",
  },
];

/**
 * The round `+` in the listings toolbar, now a menu rather than a link.
 *
 * It keeps the filled treatment it had as a link: adding a listing is the one thing this
 * page asks for, and a pale circle beside two pale view buttons read as a third view.
 */
export function AddListingMenu({ className }: { className?: string }) {
  const { resolve } = useI18n();
  const label = resolve("host.v2.listings.add", "Add a listing").text;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className={`grid size-10 place-items-center rounded-full bg-[#0f172a] text-white shadow-sm transition-colors hover:bg-[#1e293b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] ${className ?? ""}`}
      >
        <Plus className="size-5" strokeWidth={2.25} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {ADD_LISTING_ACTIONS.map((action) => {
          const Icon = action.icon;
          const text = resolve(action.labelKey, action.labelSource).text;
          const hint = action.hintKey
            ? resolve(action.hintKey, action.hintSource ?? "").text
            : null;
          return (
            <DropdownMenuItem key={action.key} asChild>
              <Link href={action.href} className="items-start gap-3 px-2 py-2">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{text}</span>
                  {hint ? (
                    <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                      {hint}
                    </span>
                  ) : null}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same two choices spelled out, for the empty state.
 *
 * A host with no listings has nothing to scan and one decision to make, so hiding the
 * second option inside a menu there would be the same mistake the toolbar just fixed.
 */
export function AddListingActions() {
  const { resolve } = useI18n();

  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
      {ADD_LISTING_ACTIONS.map((action, index) => {
        const Icon = action.icon;
        const primary = index === 0;
        return (
          <Link
            key={action.key}
            href={action.href}
            className={
              primary
                ? "inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f172a] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
                : "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
            }
          >
            <Icon className="size-4" aria-hidden />
            {resolve(action.labelKey, action.labelSource).text}
          </Link>
        );
      })}
    </div>
  );
}
