import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, Users, ArrowLeft, Star } from "lucide-react";
import { auth } from "@/lib/auth";
import { getGuestBookingWithHost } from "@/lib/services/booking.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CancelBookingButton } from "@/components/account/cancel-booking-button";
import { formatDate, formatPrice, formatGuestCount } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import { BookingStatusHero } from "@/components/booking/booking-status-hero";
import { BookingArrivalDetails } from "@/components/booking/booking-arrival-details";

interface BookingDetailProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Booking Details" };

export default async function BookingDetailPage({ params }: BookingDetailProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const booking = await getGuestBookingWithHost(id, session.user.id);

  if (!booking) notFound();

  const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
  const canCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const priceBreakdown = booking.priceBreakdown as {
    accommodationSubtotal?: number;
  } | null;
  const accommodationSubtotal =
    priceBreakdown?.accommodationSubtotal ??
    Number(booking.nightlyRate) * booking.numberOfNights;

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/account/bookings">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to bookings
        </Link>
      </Button>

      <BookingStatusHero
        status={booking.status}
        reference={booking.reference}
        responseDueAt={booking.responseDueAt}
        hostName={booking.listing.host.profile?.hostDisplayName || booking.listing.host.name}
      />

      <Card className="mt-6 overflow-hidden">
        {booking.listing.images[0]?.url ? (
          <Link href={`/properties/${booking.listing.slug}`} className="relative block h-56 sm:h-72">
            <Image
              src={booking.listing.images[0].url}
              alt={booking.listing.images[0].alt || booking.listing.title}
              fill
              sizes="(max-width: 672px) 100vw, 672px"
              className="object-cover"
            />
          </Link>
        ) : null}
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Booking Details</CardTitle>
            <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
              {statusConfig?.label || booking.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Ref: {booking.reference}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Link
              href={`/properties/${booking.listing.slug}`}
              className="text-lg font-semibold underline-offset-4 hover:underline"
            >
              {booking.listing.title}
            </Link>
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
              <span>Accommodation · {booking.numberOfNights} nights</span>
              <span>{formatPrice(accommodationSubtotal, booking.currency)}</span>
            </div>
            {Number(booking.cleaningFee) > 0 && (
              <div className="flex justify-between">
                <span>Cleaning fee</span>
                <span>{formatPrice(Number(booking.cleaningFee), booking.currency)}</span>
              </div>
            )}
            {Number(booking.discountAmount) > 0 && (
              <div className="flex justify-between text-green-700">
                <span>{booking.promotionType === "FREE_CLEANING" ? "Free cleaning" : "Special offer"}</span>
                <span>−{formatPrice(Number(booking.discountAmount), booking.currency)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="flex items-baseline gap-2">
                {booking.originalTotal && Number(booking.discountAmount) > 0 ? (
                  <span className="text-sm font-normal text-muted-foreground line-through">
                    {formatPrice(Number(booking.originalTotal), booking.currency)}
                  </span>
                ) : null}
                <span>{formatPrice(Number(booking.totalPrice), booking.currency)}</span>
              </span>
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

          <Separator />
          <div className="flex flex-wrap gap-2">
            <StartConversationButton bookingId={booking.id} label="Message host" />
            {booking.status === "COMPLETED" ? (
              <Button asChild>
                <Link href={`/account/bookings/${booking.id}/after-stay`}>
                  <Star className="mr-1 h-4 w-4" />
                  Rate your stay
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${booking.id}`}>
                Report a problem
              </Link>
            </Button>
          </div>

          {canCancel && (
            <>
              <CancelBookingButton bookingId={booking.id} />
            </>
          )}
        </CardContent>
      </Card>

      <BookingArrivalDetails
        booking={{ status: booking.status, checkIn: booking.checkIn }}
        property={booking.listing.property}
      />
    </div>
  );
}
