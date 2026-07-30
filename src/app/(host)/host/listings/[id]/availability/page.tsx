import { format } from "date-fns";
import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarWorkspace } from "@/components/host/calendar-workspace";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocale } from "@/lib/i18n/t";
import { ymdToDbDate } from "@/lib/utils/date-only";

interface AvailabilityPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Availability, pricing & promotions",
};

export default async function AvailabilityPage({
  params,
}: AvailabilityPageProps) {
  const [session, locale] = await Promise.all([auth(), getLocale()]);
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const listing = await db.listing.findFirst({
    where: { id, hostId: session.user.id },
    select: {
      id: true,
      title: true,
      status: true,
      pricingRule: true,
      promotions: {
        where: { disabledAt: null },
        orderBy: [{ minimumNights: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!listing) notFound();

  const today = ymdToDbDate(format(new Date(), "yyyy-MM-dd"));
  const [blocks, datePrices] = await Promise.all([
    db.availabilityBlock.findMany({
      where: { listingId: listing.id, endDate: { gte: today } },
      include: {
        booking: {
          select: {
            id: true,
            guest: { select: { name: true } },
            status: true,
          },
        },
      },
      orderBy: { startDate: "asc" },
    }),
    db.listingDatePrice.findMany({
      where: { listingId: listing.id, date: { gte: today } },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Link
            href="/host/listings"
            aria-label="Back to listings"
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4.5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              Availability, pricing &amp; promotions
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {listing.title}
            </p>
          </div>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="How calendar management works"
              className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CircleHelp className="size-4.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-4">
            <p className="text-sm font-semibold">How to use this calendar</p>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li>
                Select dates, then choose availability, pricing, or promotion to
                change only that period.
              </li>
              <li>
                With no dates selected, the actions manage listing visibility,
                default pricing, and always-active promotions.
              </li>
              <li>
                Date-specific promotions take priority over always-active
                promotions.
              </li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      {listing.pricingRule ? (
        <CalendarWorkspace
          listingId={listing.id}
          listingTitle={listing.title}
          listingStatus={listing.status}
          locale={locale}
          currency={listing.pricingRule.currency}
          baseNightlyRate={Number(listing.pricingRule.baseNightlyRate)}
          cleaningFee={Number(listing.pricingRule.cleaningFee)}
          minNights={listing.pricingRule.minNights}
          datePrices={datePrices.map((row) => ({
            id: row.id,
            date: row.date,
            nightlyRate: Number(row.nightlyRate),
          }))}
          blocks={blocks}
          promotions={listing.promotions.map((promotion) => ({
            id: promotion.id,
            type: promotion.type,
            discountPercent: promotion.discountPercent,
            minimumNights: promotion.minimumNights,
            freeCleaning: promotion.freeCleaning,
            roundUpToNearestFive: promotion.roundUpToNearestFive,
            startDate: promotion.startDate,
            endDate: promotion.endDate,
            createdAt: promotion.createdAt,
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Add pricing on the listing edit page before managing the calendar.
        </p>
      )}
    </div>
  );
}
