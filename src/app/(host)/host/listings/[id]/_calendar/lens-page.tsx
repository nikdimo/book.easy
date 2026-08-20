import { format } from "date-fns";
import { ArrowLeft, CircleHelp, Eye } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarWorkspace,
  type CalendarLens,
} from "@/components/host/calendar-workspace";
import { CalendarConnections } from "@/components/host/calendar-connections";
import { ListingBottomNav } from "@/components/host/listing-bottom-nav";
import { CalendarHeaderActions } from "@/components/host/calendar-header-actions";
import {
  LISTING_ACTION_BAR_ID,
  listingStopHref,
} from "@/lib/host/listing-workspace";
import { Button } from "@/components/ui/button";
import { ListingManagementTabs } from "@/components/host/listing-management-tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocale, getT, T } from "@/lib/i18n/t";
import { ymdToDbDate } from "@/lib/utils/date-only";

/** Availability, pricing and promotions are one calendar seen three ways, so they
 *  share this shell and differ only by `lens`. */
const LENS_COPY: Record<
  CalendarLens,
  { heading: string; hint: string; help: string[] }
> = {
  availability: {
    heading: "Availability",
    hint: "Which dates guests can book.",
    help: [
      "Select one date or drag across a range, then block or open it.",
      "Reservations are protected — they cannot be blocked or opened here.",
      "With no dates selected, the action shows or hides the whole listing.",
    ],
  },
  pricing: {
    heading: "Pricing",
    hint: "What each night costs.",
    help: [
      "Each date shows its nightly rate before discounts and fees.",
      "Dates without a custom price follow the base price in Standard pricing.",
      "Changing a price never changes what an existing booking already paid.",
    ],
  },
  promotions: {
    heading: "Promotions",
    hint: "Discounts running on your dates.",
    help: [
      "Shaded dates are covered by a date-specific promotion.",
      "Always-active promotions apply to every date and are listed below.",
      "The promotion that saves the guest most wins on each night.",
    ],
  },
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function readYmd(value: string | string[] | undefined) {
  if (typeof value !== "string" || !YMD.test(value)) return undefined;
  return value;
}

export interface CalendarLensPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  lens: CalendarLens;
}

export async function CalendarLensPage({
  params,
  searchParams,
  lens,
}: CalendarLensPageProps) {
  const [session, locale, t] = await Promise.all([auth(), getLocale(), getT()]);
  if (!session?.user?.id) redirect("/login");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const listing = await db.listing.findFirst({
    where: { id, hostId: session.user.id },
    select: {
      id: true,
      title: true,
      status: true,
      availabilityMode: true,
      availabilityWindows: {
        where: { endDate: { gte: ymdToDbDate(format(new Date(), "yyyy-MM-dd")) } },
        orderBy: { startDate: "asc" },
      },
      pricingRule: true,
      promotions: {
        where: { disabledAt: null },
        orderBy: [{ minimumNights: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!listing) notFound();

  const today = ymdToDbDate(format(new Date(), "yyyy-MM-dd"));
  const [blocks, datePrices, connectedFeeds] = await Promise.all([
    db.availabilityBlock.findMany({
      where: { listingId: listing.id, endDate: { gte: today } },
      include: {
        booking: {
          select: { id: true, guest: { select: { name: true } }, status: true },
        },
      },
      orderBy: { startDate: "asc" },
    }),
    db.listingDatePrice.findMany({
      where: { listingId: listing.id, date: { gte: today } },
      orderBy: { date: "asc" },
    }),
    // Only the count: the panel loads its own detail when the host opens it, which is
    // also what keeps the export token from being minted on every calendar view.
    lens === "availability"
      ? db.listingCalendarFeed.count({ where: { listingId: listing.id } })
      : Promise.resolve(0),
  ]);

  const copy = LENS_COPY[lens];
  const initialFrom = readYmd(query.from);
  const initialTo = readYmd(query.to);
  const selectionQuery =
    initialFrom && initialTo ? `?from=${initialFrom}&to=${initialTo}` : "";

  return (
    // Mobile padding keeps the last row clear of the fixed action and nav bars.
    <div className="mx-auto max-w-7xl space-y-3 pb-44 md:pb-0">
      {/* Phones get these two in the shell header instead — see below. */}
      <div className="hidden items-start justify-between gap-3 md:flex">
        <div className="flex min-w-0 items-start gap-2.5">
          <Link
            href="/host/listings"
            aria-label={
              t.resolve("host.calendar.back_to_listings", "Back to listings").text
            }
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4.5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              {copy.heading}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {listing.title} · {copy.hint}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={listingStopHref(listing.id, "preview")}>
              <Eye className="size-4" />
              <T t={t} k="host.workspace.preview" source="Preview" />
            </Link>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`How ${copy.heading.toLowerCase()} works`}
                className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <CircleHelp className="size-4.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4">
              <p className="text-sm font-semibold">{copy.heading}</p>
              <ul className="mt-2 space-y-2 text-sm md:text-xs leading-relaxed text-muted-foreground">
                {copy.help.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <CalendarHeaderActions
        heading={copy.heading}
        help={copy.help}
        listingId={listing.id}
      />

      <ListingManagementTabs
        listingId={listing.id}
        preserveQuery={selectionQuery}
        className="hidden md:block"
      />

      {listing.pricingRule ? (
        <CalendarWorkspace
          listingId={listing.id}
          listingTitle={listing.title}
          listingStatus={listing.status}
          availabilityMode={listing.availabilityMode}
          lens={lens}
          locale={locale}
          currency={listing.pricingRule.currency}
          baseNightlyRate={Number(listing.pricingRule.baseNightlyRate)}
          cleaningFee={Number(listing.pricingRule.cleaningFee)}
          minNights={listing.pricingRule.minNights}
          initialFrom={initialFrom}
          initialTo={initialTo}
          datePrices={datePrices.map((row) => ({
            id: row.id,
            date: row.date,
            nightlyRate: Number(row.nightlyRate),
          }))}
          blocks={blocks}
          availabilityWindows={listing.availabilityWindows}
          promotions={listing.promotions.map((promotion) => ({
            id: promotion.id,
            type: promotion.type,
            discountPercent: promotion.discountPercent,
            minimumNights: promotion.minimumNights,
            freeCleaning: promotion.freeCleaning,
            roundToWholeUnit: promotion.roundToWholeUnit,
            startDate: promotion.startDate,
            endDate: promotion.endDate,
            createdAt: promotion.createdAt,
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          <T
            t={t}
            k="host.calendar.needs_pricing"
            source="Add pricing on the listing edit page before managing the calendar."
          />
        </p>
      )}

      {/* Only under Availability: connecting a channel is a statement about which dates
          are bookable, and it would be noise on the pricing and promotion lenses. */}
      {lens === "availability" ? (
        <CalendarConnections listingId={listing.id} feedCount={connectedFeeds} />
      ) : null}

      {/* Fixed because this page scrolls inside the host shell's main area rather
          than owning its own flex column.

          The old Preview/Publish pair is gone: by the time a host is setting dates
          the listing is already live, so Publish sat disabled, and Preview left the
          calendar entirely. The workspace fills the slot below with actions for the
          dates currently selected instead. */}
      <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div id={LISTING_ACTION_BAR_ID} className="[&>div]:!pb-2" />
        <ListingBottomNav
          listingId={listing.id}
          active={lens}
          preserveQuery={selectionQuery}
        />
      </div>
    </div>
  );
}
