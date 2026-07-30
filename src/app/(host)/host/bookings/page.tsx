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
                    <p className="text-xs font-medium text-muted-foreground">{booking.reference}</p>
                  </div>
                  <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                    {statusConfig?.label || booking.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-2 md:grid-cols-4">
                  <div className="min-w-0">
                    <span className="text-muted-foreground">Guest: </span>
                    <span className="font-medium">{booking.guest.name}</span>
                  </div>
                  <div className="min-w-0 break-words">
                    <span className="text-muted-foreground">Dates: </span>
                    <span>{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-muted-foreground">Guests: </span>
                    <span>{booking.guestCount}</span>
                  </div>
                  <div className="min-w-0">
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
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/host/bookings/${booking.id}`}>View details</Link>
                  </Button>
                  <StartConversationButton bookingId={booking.id} label="Message guest" />
                  {booking.status === "COMPLETED" ? (
                    <Button asChild>
                      <Link href={`/account/bookings/${booking.id}/after-stay`}>
                        <Star className="mr-1 h-4 w-4" />
                        Rate guest
                      </Link>
                    </Button>
                  ) : null}
                  <Button variant="outline" asChild>
                    <Link href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${booking.id}`}>
                      Report a problem
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
