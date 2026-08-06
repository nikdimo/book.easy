import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { auth } from "@/lib/auth";
import { getGuestBookingForConfirmation } from "@/lib/services/booking.service";
import { formatDate } from "@/lib/utils/format";
import { formatMoney } from "@/lib/currency/convert";
import { getTForLocale, T, TWithValues, ti, tPlural } from "@/lib/i18n/t";
import { BookingStatusHero } from "@/components/booking/booking-status-hero";
import { BOOKING_STATUSES } from "@/lib/constants";

interface ConfirmPageProps {
  searchParams: Promise<{ id?: string }>;
}

export const metadata = {
  title: "Booking request",
};

export default async function BookingConfirmPage({ searchParams }: ConfirmPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await searchParams;
  if (!id) redirect("/");

  const booking = await getGuestBookingForConfirmation(id, session.user.id);

  if (!booking) redirect("/");
  const t = await getTForLocale(booking.guestLocale ?? "en");
  const guests = tPlural(t, "booking.guests", booking.guestCount, "{n} guest", "{n} guests");
  const nights = tPlural(t, "booking.nights", booking.numberOfNights, "{n} night", "{n} nights");
  const reference = ti(t, "booking.reference", "Booking reference: {reference}", {
    reference: booking.reference,
  });
  const priceBreakdown = booking.priceBreakdown as {
    accommodationSubtotal?: number;
  } | null;
  const accommodationSubtotal =
    priceBreakdown?.accommodationSubtotal ??
    Number(booking.nightlyRate) * booking.numberOfNights;
  const status = BOOKING_STATUSES.find((item) => item.value === booking.status);
  const isPending = booking.status === "PENDING";

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <BookingStatusHero
        status={booking.status}
        reference={booking.reference}
        responseDueAt={booking.responseDueAt}
        titleOverride={
          isPending ? <T t={t} k="booking.request_sent" source="Booking request sent!" /> : undefined
        }
        bodyOverride={
          isPending ? (
            <T
              t={t}
              k="booking.request_sent_description"
              source="Your booking request has been submitted. The host will review and respond."
            />
          ) : undefined
        }
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
            <CardTitle className="text-lg"><T t={t} k="booking.details" source="Booking details" /></CardTitle>
            <Badge variant="secondary">
              {isPending ? (
                <T t={t} k="booking.pending" source="Pending" />
              ) : (
                status?.label ?? booking.status
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Link
              href={`/properties/${booking.listing.slug}`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {booking.listing.title}
            </Link>
            <div
              className="notranslate flex items-center gap-1 text-sm text-muted-foreground mt-1"
              translate="no"
            >
              <MapPin className="h-3 w-3" />
              {booking.listing.property.city}, {booking.listing.property.country}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground"><T t={t} k="booking.check_in" source="Check-in" /></p>
              <p
                className="notranslate font-medium flex items-center gap-1"
                translate="no"
              >
                <Calendar className="h-3 w-3" />
                {formatDate(booking.checkIn, t.locale)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={t} k="booking.check_out" source="Check-out" /></p>
              <p
                className="notranslate font-medium flex items-center gap-1"
                translate="no"
              >
                <Calendar className="h-3 w-3" />
                {formatDate(booking.checkOut, t.locale)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={t} k="booking.guests_label" source="Guests" /></p>
              <p className="font-medium flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span className={guests.translated ? "notranslate" : undefined}>{guests.text}</span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={t} k="booking.nights_label" source="Nights" /></p>
              <p className={nights.translated ? "notranslate font-medium" : "font-medium"}>{nights.text}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span><T t={t} k="booking.accommodation" source="Accommodation" /> · <span className={nights.translated ? "notranslate" : undefined}>{nights.text}</span></span>
              <LocalizedPrice official amount={accommodationSubtotal} currency={booking.currency} locale={t.locale} />
            </div>
            {Number(booking.cleaningFee) > 0 && (
              <div className="flex justify-between">
                <span><T t={t} k="booking.cleaning_fee" source="Cleaning fee" /></span>
                <LocalizedPrice official amount={Number(booking.cleaningFee)} currency={booking.currency} locale={t.locale} />
              </div>
            )}
            {Number(booking.discountAmount) > 0 && (
              <div className="flex justify-between text-green-700">
                <span>
                  {booking.promotionType === "FREE_CLEANING"
                    ? <T t={t} k="promotion.free_cleaning" source="Free cleaning" />
                    : <T t={t} k="promotion.special_offer" source="Special offer" />}
                </span>
                <span>−<LocalizedPrice official amount={Number(booking.discountAmount)} currency={booking.currency} locale={t.locale} /></span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span><T t={t} k="booking.total" source="Total" /></span>
              <span className="flex items-baseline gap-2">
                {booking.originalTotal && Number(booking.discountAmount) > 0 ? (
                  <LocalizedPrice official amount={Number(booking.originalTotal)} currency={booking.currency} locale={t.locale} className="text-sm font-normal text-muted-foreground line-through" />
                ) : null}
                <LocalizedPrice official amount={Number(booking.totalPrice)} currency={booking.currency} locale={t.locale} />
              </span>
            </div>
            {/* The booking is agreed in the listing's currency. This line is the
                figure the guest was browsing at when they booked, frozen with the
                rate used — deliberately not re-converted at today's rate, so
                reopening this page never changes what it says. */}
            {booking.displayCurrency && booking.displayTotal ? (
              <p className="text-right text-xs text-muted-foreground">
                <TWithValues
                  t={t}
                  k="booking.display_total_approx"
                  source="Approximately {amount} at the time of booking. The booking is agreed in {currency}."
                  values={{
                    amount: formatMoney(
                      Number(booking.displayTotal),
                      booking.displayCurrency,
                      t.locale,
                      { converted: true },
                    ),
                    currency: booking.currency,
                  }}
                />
              </p>
            ) : null}
          </div>

          <p className={reference.translated ? "notranslate text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>{reference.text}</p>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-6 justify-center">
        <Button asChild>
          <Link href={`/account/bookings/${booking.id}`}><T t={t} k="booking.view_bookings" source="View my bookings" /></Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/properties"><T t={t} k="booking.continue_browsing" source="Continue browsing" /></Link>
        </Button>
      </div>
    </div>
  );
}
