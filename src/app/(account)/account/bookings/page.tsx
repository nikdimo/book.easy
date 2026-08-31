import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin } from "lucide-react";
import { auth } from "@/lib/auth";
import { getGuestBookings } from "@/lib/services/booking.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCalendarDate, formatPrice } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";
import { getT, T, t as text } from "@/lib/i18n/t";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";

export const metadata = { title: "My Bookings" };

export default async function MyBookingsPage() {
  const t = await getT();
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bookings = await getGuestBookings(session.user.id);

  if (bookings.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6"><T t={t} k="account.bookings.heading" source="My Bookings" /></h1>
        <EmptyState
          title={text(t, "account.bookings.empty_title", "No bookings yet")}
          description={text(t, "account.bookings.empty_description", "Start exploring and book your first stay!")}
        >
          <Button asChild>
            <Link href="/properties"><T t={t} k="account.browse_properties" source="Browse Properties" /></Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6"><T t={t} k="account.bookings.heading" source="My Bookings" /></h1>
      <div className="space-y-4">
        {bookings.map((booking) => {
          const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
          return (
            <Link key={booking.id} href={`/account/bookings/${booking.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="flex gap-4 p-4">
                  {booking.listing.images[0]?.url ? (
                    <span className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-40">
                      <Image
                        src={booking.listing.images[0].url}
                        alt={booking.listing.images[0].alt || booking.listing.title}
                        fill
                        sizes="(max-width: 640px) 112px, 160px"
                        className="object-cover"
                      />
                    </span>
                  ) : null}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <h3 className="min-w-0 flex-1 font-semibold" data-user-generated-content translate="yes">{booking.listing.title}</h3>
                      <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                        {resolveBookingStatus(t, statusConfig?.value || booking.status).text}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {booking.reference}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {booking.listing.property.city}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatCalendarDate(booking.checkIn, t.locale)} – {formatCalendarDate(booking.checkOut, t.locale)}
                      </span>
                      <span className="font-medium">{formatPrice(Number(booking.totalPrice), booking.currency, t.locale)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
