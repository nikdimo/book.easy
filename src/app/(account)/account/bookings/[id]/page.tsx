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
import { getT, T, t, ti } from "@/lib/i18n/t";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";

interface BookingDetailProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Booking Details" };

export default async function BookingDetailPage({ params }: BookingDetailProps) {
  const translator = await getT();
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
          <T t={translator} k="account.booking.back" source="Back to bookings" />
        </Link>
      </Button>

      <BookingStatusHero
        status={booking.status}
        reference={booking.reference}
        responseDueAt={booking.responseDueAt}
        hostName={booking.listing.host.profile?.hostDisplayName || booking.listing.host.name}
      />

      {/* This page is where a guest comes back looking for "pay now". There isn't one,
          and the hero only has room to say who will send the instructions. */}
      {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          <T
            t={translator}
            k="booking.payment_arranged_with_host"
            source="Linger Homes does not collect or hold booking payments. Payment is arranged directly with the host after the booking is accepted."
          />
        </p>
      ) : null}

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
            <CardTitle><T t={translator} k="account.booking.details" source="Booking Details" /></CardTitle>
            <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
              {resolveBookingStatus(translator, statusConfig?.value || booking.status).text}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            <T t={translator} k="account.booking.reference_short" source="Ref:" /> {booking.reference}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Link
              href={`/properties/${booking.listing.slug}`}
              className="text-lg font-semibold underline-offset-4 hover:underline"
            >
              <span data-user-generated-content translate="yes">{booking.listing.title}</span>
            </Link>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {booking.listing.property.area && `${booking.listing.property.area}, `}
              {booking.listing.property.city}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {ti(translator, "account.booking.hosted_by", "Hosted by {name}", { name: booking.listing.host.profile?.hostDisplayName || booking.listing.host.name }).text}
            </p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground"><T t={translator} k="account.booking.check_in" source="Check-in" /></p>
              <p className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(booking.checkIn)}</p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={translator} k="account.booking.check_out" source="Check-out" /></p>
              <p className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(booking.checkOut)}</p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={translator} k="account.booking.guests" source="Guests" /></p>
              <p className="font-medium flex items-center gap-1"><Users className="h-3 w-3" />{formatGuestCount(booking.guestCount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={translator} k="account.booking.nights" source="Nights" /></p>
              <p className="font-medium">{booking.numberOfNights}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{ti(translator, "account.booking.accommodation_nights", "Accommodation · {count} nights", { count: booking.numberOfNights }).text}</span>
              <span>{formatPrice(accommodationSubtotal, booking.currency)}</span>
            </div>
            {Number(booking.cleaningFee) > 0 && (
              <div className="flex justify-between">
                <span><T t={translator} k="account.booking.cleaning_fee" source="Cleaning fee" /></span>
                <span>{formatPrice(Number(booking.cleaningFee), booking.currency)}</span>
              </div>
            )}
            {Number(booking.discountAmount) > 0 && (
              <div className="flex justify-between text-green-700">
                <span>{booking.promotionType === "FREE_CLEANING" ? t(translator, "account.booking.free_cleaning", "Free cleaning") : t(translator, "account.booking.special_offer", "Special offer")}</span>
                <span>−{formatPrice(Number(booking.discountAmount), booking.currency)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span><T t={translator} k="account.booking.total" source="Total" /></span>
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
                <p className="text-sm text-muted-foreground mb-1"><T t={translator} k="account.booking.your_message" source="Your message" /></p>
                <p className="text-sm" data-user-generated-content translate="yes">{booking.guestNote}</p>
              </div>
            </>
          )}

          {booking.cancellationReason && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1"><T t={translator} k="account.booking.cancellation_reason" source="Cancellation reason" /></p>
                <p className="text-sm" data-user-generated-content translate="yes">{booking.cancellationReason}</p>
              </div>
            </>
          )}

          <Separator />
          <div className="flex flex-wrap gap-2">
            <StartConversationButton bookingId={booking.id} label={t(translator, "account.booking.message_host", "Message host")} />
            {booking.status === "COMPLETED" ? (
              <Button asChild>
                <Link href={`/account/bookings/${booking.id}/after-stay`}>
                  <Star className="mr-1 h-4 w-4" />
                  <T t={translator} k="account.booking.rate_stay" source="Rate your stay" />
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${booking.id}`}>
                <T t={translator} k="account.booking.report_problem" source="Report a problem" />
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
