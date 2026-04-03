import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin, Users, ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CancelBookingButton } from "@/components/account/cancel-booking-button";
import { formatDate, formatPrice, formatGuestCount } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";

interface BookingDetailProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Booking Details" };

export default async function BookingDetailPage({ params }: BookingDetailProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const booking = await db.booking.findFirst({
    where: { id, guestId: session.user.id },
    include: {
      listing: {
        include: {
          property: true,
          host: { include: { profile: true } },
        },
      },
    },
  });

  if (!booking) notFound();

  const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
  const canCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";

  return (
    <div className="max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/account/bookings">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to bookings
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Booking Details</CardTitle>
            <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
              {statusConfig?.label || booking.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Ref: {booking.id.slice(0, 8).toUpperCase()}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold text-lg">{booking.listing.title}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {booking.listing.property.area && `${booking.listing.property.area}, `}
              {booking.listing.property.city}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Hosted by {booking.listing.host.profile?.hostDisplayName || booking.listing.host.name}
            </p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Check-in</p>
              <p className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(booking.checkIn)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out</p>
              <p className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(booking.checkOut)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Guests</p>
              <p className="font-medium flex items-center gap-1"><Users className="h-3 w-3" />{formatGuestCount(booking.guestCount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Nights</p>
              <p className="font-medium">{booking.numberOfNights}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{formatPrice(Number(booking.nightlyRate))} x {booking.numberOfNights} nights</span>
              <span>{formatPrice(Number(booking.nightlyRate) * booking.numberOfNights)}</span>
            </div>
            {Number(booking.cleaningFee) > 0 && (
              <div className="flex justify-between">
                <span>Cleaning fee</span>
                <span>{formatPrice(Number(booking.cleaningFee))}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span>{formatPrice(Number(booking.totalPrice))}</span>
            </div>
          </div>

          {booking.guestNote && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Your message</p>
                <p className="text-sm">{booking.guestNote}</p>
              </div>
            </>
          )}

          {booking.cancellationReason && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Cancellation reason</p>
                <p className="text-sm">{booking.cancellationReason}</p>
              </div>
            </>
          )}

          {canCancel && (
            <>
              <Separator />
              <CancelBookingButton bookingId={booking.id} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
