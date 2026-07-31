import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHostBookings } from "@/lib/services/listing.service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { HostBookingActions } from "@/components/host/host-booking-actions";
import { HostCancelBookingButton } from "@/components/host/host-cancel-booking-button";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "Booking Requests" };

export default async function HostBookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bookings = await getHostBookings(session.user.id);
  const t = await getT();

  if (bookings.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">
          <T t={t} k="host.bookings.heading" source="Booking Requests" />
        </h1>
        <EmptyState
          title={t.resolve("host.bookings.empty_title", "No bookings yet").text}
          description={
            t.resolve(
              "host.bookings.empty_description",
              "Bookings will appear here when guests request to stay at your listings.",
            ).text
          }
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        <T t={t} k="host.bookings.heading" source="Booking Requests" />
      </h1>
      <div className="space-y-3">
        {bookings.map((booking) => {
          const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
          return (
            <Card key={booking.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {booking.listing.images[0]?.url ? (
                    <span className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg">
                      <Image
                        src={booking.listing.images[0].url}
                        alt={booking.listing.images[0].alt || booking.listing.title}
                        fill
                        sizes="112px"
                        className="object-cover"
                      />
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold">{booking.listing.title}</h3>
                    <p className="text-sm text-muted-foreground">{booking.listing.property.city}</p>
                    <p className="text-sm md:text-xs font-medium text-muted-foreground">{booking.reference}</p>
                  </div>
                  <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                    {statusConfig?.label || booking.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-2 md:grid-cols-4">
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      <T t={t} k="host.bookings.guest_label" source="Guest:" />{" "}
                    </span>
                    <span className="font-medium">{booking.guest.name}</span>
                  </div>
                  <div className="min-w-0 break-words">
                    <span className="text-muted-foreground">
                      <T t={t} k="host.bookings.dates_label" source="Dates:" />{" "}
                    </span>
                    <span>{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      <T t={t} k="host.bookings.guests_label" source="Guests:" />{" "}
                    </span>
                    <span>{booking.guestCount}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      <T t={t} k="host.bookings.total_label" source="Total:" />{" "}
                    </span>
                    <span className="font-medium">{formatPrice(Number(booking.totalPrice))}</span>
                  </div>
                </div>
                {booking.guestNote && (
                  <p className="text-sm bg-muted p-2 rounded">
                    “{booking.guestNote}”
                  </p>
                )}
                {booking.status === "PENDING" && (
                  <HostBookingActions bookingId={booking.id} />
                )}
                {booking.status === "CONFIRMED" && (
                  <HostCancelBookingButton bookingId={booking.id} />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/host/bookings/${booking.id}`}>
                      <T t={t} k="host.bookings.view_details" source="View details" />
                    </Link>
                  </Button>
                  <StartConversationButton
                    bookingId={booking.id}
                    label={
                      t.resolve("host.bookings.message_guest", "Message guest").text
                    }
                  />
                  {booking.status === "COMPLETED" ? (
                    <Button asChild>
                      <Link href={`/account/bookings/${booking.id}/after-stay`}>
                        <Star className="mr-1 h-4 w-4" />
                        <T t={t} k="host.bookings.rate_guest" source="Rate guest" />
                      </Link>
                    </Button>
                  ) : null}
                  <Button variant="outline" asChild>
                    <Link href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${booking.id}`}>
                      <T
                        t={t}
                        k="host.bookings.report_problem"
                        source="Report a problem"
                      />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
