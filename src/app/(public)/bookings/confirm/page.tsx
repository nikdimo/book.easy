import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Calendar, MapPin, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { auth } from "@/lib/auth";
import { getGuestBookingForConfirmation } from "@/lib/services/booking.service";
import { formatDate } from "@/lib/utils/format";
import { getT, T, ti, tPlural } from "@/lib/i18n/t";

interface ConfirmPageProps {
  searchParams: Promise<{ id?: string }>;
}

export const metadata = {
  title: "Booking Confirmed",
};

export default async function BookingConfirmPage({ searchParams }: ConfirmPageProps) {
  const t = await getT();
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await searchParams;
  if (!id) redirect("/");

  const booking = await getGuestBookingForConfirmation(id, session.user.id);

  if (!booking) redirect("/");
  const guests = tPlural(t, "booking.guests", booking.guestCount, "{n} guest", "{n} guests");
  const nights = tPlural(t, "booking.nights", booking.numberOfNights, "{n} night", "{n} nights");
  const reference = ti(t, "booking.reference", "Booking reference: {reference}", {
    reference: booking.id.slice(0, 8).toUpperCase(),
  });

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <div className="text-center mb-8">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2"><T t={t} k="booking.request_sent" source="Booking request sent!" /></h1>
        <p className="text-muted-foreground">
          <T t={t} k="booking.request_sent_description" source="Your booking request has been submitted. The host will review and respond." />
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg"><T t={t} k="booking.details" source="Booking details" /></CardTitle>
            <Badge variant="secondary"><T t={t} k="booking.pending" source="Pending" /></Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">{booking.listing.title}</h3>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="h-3 w-3" />
              {booking.listing.property.city}, {booking.listing.property.country}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground"><T t={t} k="booking.check_in" source="Check-in" /></p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(booking.checkIn, t.locale)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={t} k="booking.check_out" source="Check-out" /></p>
              <p className="font-medium flex items-center gap-1">
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
              <span><LocalizedPrice amount={Number(booking.nightlyRate)} locale={t.locale} /> × <span className={nights.translated ? "notranslate" : undefined}>{nights.text}</span></span>
              <LocalizedPrice amount={Number(booking.nightlyRate) * booking.numberOfNights} locale={t.locale} />
            </div>
            {Number(booking.cleaningFee) > 0 && (
              <div className="flex justify-between">
                <span><T t={t} k="booking.cleaning_fee" source="Cleaning fee" /></span>
                <LocalizedPrice amount={Number(booking.cleaningFee)} locale={t.locale} />
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span><T t={t} k="booking.total" source="Total" /></span>
              <LocalizedPrice amount={Number(booking.totalPrice)} locale={t.locale} />
            </div>
          </div>

          <p className={reference.translated ? "notranslate text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>{reference.text}</p>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-6 justify-center">
        <Button asChild>
          <Link href="/account/bookings"><T t={t} k="booking.view_bookings" source="View my bookings" /></Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/properties"><T t={t} k="booking.continue_browsing" source="Continue browsing" /></Link>
        </Button>
      </div>
    </div>
  );
}
