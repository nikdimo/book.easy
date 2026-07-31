import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Calendar, MapPin, Star, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHostBookingWithGuest } from "@/lib/services/booking.service";
import { BookingStatusHero } from "@/components/booking/booking-status-hero";
import { HostBookingActions } from "@/components/host/host-booking-actions";
import { HostCancelBookingButton } from "@/components/host/host-cancel-booking-button";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate, formatPrice } from "@/lib/utils/format";

export const metadata = { title: "Booking Request Details" };

export default async function HostBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const booking = await getHostBookingWithGuest(id, session.user.id);
  if (!booking) notFound();

  const priceBreakdown = booking.priceBreakdown as {
    accommodationSubtotal?: number;
  } | null;
  const accommodationSubtotal =
    priceBreakdown?.accommodationSubtotal ??
    Number(booking.nightlyRate) * booking.numberOfNights;

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/host/bookings">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to requests
        </Link>
      </Button>

      <BookingStatusHero
        status={booking.status}
        reference={booking.reference}
        responseDueAt={booking.responseDueAt}
        audience="host"
      />

      <Card className="mt-6 overflow-hidden">
        {booking.listing.images[0]?.url ? (
          <Link href={`/properties/${booking.listing.slug}`} className="relative block h-56 sm:h-72">
            <Image
              src={booking.listing.images[0].url}
              alt={booking.listing.images[0].alt || booking.listing.title}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </Link>
        ) : null}
        <CardHeader>
          <CardTitle>
            <Link
              href={`/properties/${booking.listing.slug}`}
              className="underline-offset-4 hover:underline"
            >
              {booking.listing.title}
            </Link>
          </CardTitle>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {booking.listing.property.area
              ? `${booking.listing.property.area}, `
              : ""}
            {booking.listing.property.city}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <p className="text-sm md:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Guest
            </p>
            <p className="mt-1 text-lg font-semibold">{booking.guest.name}</p>
            <p className="text-sm text-muted-foreground">
              Keep communication in Linger Homes so the conversation stays protected.
            </p>
          </section>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Check-in</p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(booking.checkIn)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out</p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(booking.checkOut)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Guests</p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <Users className="h-3.5 w-3.5" />
                {booking.guestCount}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Nights</p>
              <p className="mt-1 font-medium">{booking.numberOfNights}</p>
            </div>
          </div>

          {booking.guestNote ? (
            <>
              <Separator />
              <section className="rounded-xl bg-muted p-4">
                <p className="text-sm md:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Guest message
                </p>
                <p className="mt-2 text-sm leading-6">“{booking.guestNote}”</p>
              </section>
            </>
          ) : null}

          <Separator />

          <section className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>Accommodation · {booking.numberOfNights} nights</span>
              <span>{formatPrice(accommodationSubtotal, booking.currency)}</span>
            </div>
            {Number(booking.cleaningFee) > 0 ? (
              <div className="flex justify-between gap-4">
                <span>Cleaning fee</span>
                <span>{formatPrice(Number(booking.cleaningFee), booking.currency)}</span>
              </div>
            ) : null}
            <Separator />
            <div className="flex justify-between gap-4 text-base font-semibold">
              <span>Booking total</span>
              <span>{formatPrice(Number(booking.totalPrice), booking.currency)}</span>
            </div>
          </section>

          <Separator />

          {booking.status === "PENDING" ? (
            <HostBookingActions bookingId={booking.id} />
          ) : null}
          {booking.status === "CONFIRMED" ? (
            <HostCancelBookingButton bookingId={booking.id} />
          ) : null}

          <div className="flex flex-wrap gap-2">
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
              <Link
                href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${booking.id}`}
              >
                Report a problem
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
