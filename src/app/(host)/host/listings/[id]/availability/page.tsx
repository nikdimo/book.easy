import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PropertyAvailabilityCalendar } from "@/components/shared/property-availability-calendar";
import { ymdToDbDate } from "@/lib/utils/date-only";
import { format } from "date-fns";

interface AvailabilityPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Manage Availability" };

export default async function AvailabilityPage({ params }: AvailabilityPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const listing = await db.listing.findFirst({
    where: { id, hostId: session.user.id },
    select: {
      id: true,
      title: true,
      pricingRule: { select: { baseNightlyRate: true, currency: true } },
    },
  });

  if (!listing) notFound();

  const today = ymdToDbDate(format(new Date(), "yyyy-MM-dd"));

  const [blocks, datePrices] = await Promise.all([
    db.availabilityBlock.findMany({
      where: { listingId: listing.id, endDate: { gte: today } },
      include: {
        booking: { select: { id: true, guest: { select: { name: true } }, status: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    db.listingDatePrice.findMany({
      where: { listingId: listing.id, date: { gte: today } },
      orderBy: { date: "asc" },
    }),
  ]);

  const base = listing.pricingRule
    ? Number(listing.pricingRule.baseNightlyRate)
    : 0;
  const currency = listing.pricingRule?.currency ?? "EUR";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Availability &amp; pricing</h1>
      <p className="text-muted-foreground mb-6">{listing.title}</p>
      {listing.pricingRule ? (
        <PropertyAvailabilityCalendar
          listingId={listing.id}
          baseNightlyRate={base}
          currency={currency}
          datePrices={datePrices}
          existingBlocks={blocks}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Add pricing on the listing edit page before managing the calendar.
        </p>
      )}
    </div>
  );
}
