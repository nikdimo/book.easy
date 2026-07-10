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

export const metadata = { title: "Booking Requests" };

export default async function HostBookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bookings = await getHostBookings(session.user.id);

  if (bookings.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Booking Requests</h1>
        <EmptyState title="No bookings yet" description="Bookings will appear here when guests request to stay at your listings." />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Booking Requests</h1>
      <div className="space-y-3">
        {bookings.map((booking) => {
          const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
          return (
            <Card key={booking.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{booking.listing.title}</h3>
                    <p className="text-sm text-muted-foreground">{booking.listing.property.city}</p>
                  </div>
                  <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                    {statusConfig?.label || booking.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Guest: </span>
                    <span className="font-medium">{booking.guest.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Dates: </span>
                    <span>{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Guests: </span>
                    <span>{booking.guestCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-medium">{formatPrice(Number(booking.totalPrice))}</span>
                  </div>
                </div>
                {booking.guestNote && (
                  <p className="text-sm bg-muted p-2 rounded">&ldquo;{booking.guestNote}&rdquo;</p>
                )}
                {booking.status === "PENDING" && (
                  <HostBookingActions bookingId={booking.id} />
                )}
                {booking.status === "CONFIRMED" && (
                  <HostCancelBookingButton bookingId={booking.id} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
