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
import { formatMoney } from "@/lib/currency/convert";
import { getT, T, TWithValues } from "@/lib/i18n/t";
import { getBookingPaymentProgress } from "@/lib/services/booking-payment-status.service";
import { parseDepositPoliciesSnapshot } from "@/lib/payments/deposit-policies";
import { BookingPaymentProgress } from "@/components/booking/booking-payment-progress";
import { acceptedPaymentMethodsFromSnapshot } from "@/components/booking/accepted-payment-methods";

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
  const paymentProgress = await getBookingPaymentProgress(booking.id, session.user.id);
  const paymentMethods = acceptedPaymentMethodsFromSnapshot(
    booking.paymentMethodsSnapshot,
    booking.createdAt,
  );

  const t = await getT();
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
          <T t={t} k="host.booking_detail.back" source="Back to requests" />
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
              <T t={t} k="host.booking_detail.guest" source="Guest" />
            </p>
            <p className="mt-1 text-lg font-semibold">{booking.guest.name}</p>
            <p className="text-sm text-muted-foreground">
              <T
                t={t}
                k="host.booking_detail.keep_communication"
                source="Keep communication in Linger Homes so the conversation stays protected."
              />
            </p>
          </section>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">
                <T t={t} k="host.booking_detail.check_in" source="Check-in" />
              </p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(booking.checkIn, t.locale)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">
                <T t={t} k="host.booking_detail.check_out" source="Check-out" />
              </p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(booking.checkOut, t.locale)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">
                <T t={t} k="host.booking_detail.guests" source="Guests" />
              </p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <Users className="h-3.5 w-3.5" />
                {booking.guestCount}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">
                <T t={t} k="host.booking_detail.nights" source="Nights" />
              </p>
              <p className="mt-1 font-medium">{booking.numberOfNights}</p>
            </div>
          </div>

          {booking.guestNote ? (
            <>
              <Separator />
              <section className="rounded-xl bg-muted p-4">
                <p className="text-sm md:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <T t={t} k="host.booking_detail.guest_message" source="Guest message" />
                </p>
                <p className="mt-2 text-sm leading-6">“{booking.guestNote}”</p>
              </section>
            </>
          ) : null}

          <Separator />

          <section className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>
                <TWithValues
                  t={t}
                  k="host.booking_detail.accommodation"
                  source="Accommodation · {nights} nights"
                  values={{ nights: booking.numberOfNights }}
                />
              </span>
              <span>{formatPrice(accommodationSubtotal, booking.currency, t.locale)}</span>
            </div>
            {Number(booking.cleaningFee) > 0 ? (
              <div className="flex justify-between gap-4">
                <span>
                  <T t={t} k="host.booking_detail.cleaning_fee" source="Cleaning fee" />
                </span>
                <span>{formatPrice(Number(booking.cleaningFee), booking.currency, t.locale)}</span>
              </div>
            ) : null}
            <Separator />
            <div className="flex justify-between gap-4 text-base font-semibold">
              <span>
                <T t={t} k="host.booking_detail.total" source="Booking total" />
              </span>
              <span>{formatPrice(Number(booking.totalPrice), booking.currency, t.locale)}</span>
            </div>
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
          </section>

          <Separator />

          {booking.status === "PENDING" ? (
            <HostBookingActions bookingId={booking.id} />
          ) : null}
          {booking.status === "CONFIRMED" ? (
            <HostCancelBookingButton bookingId={booking.id} />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <StartConversationButton
              bookingId={booking.id}
              label={t.resolve("host.bookings.message_guest", "Message guest").text}
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
              <Link
                href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${booking.id}`}
              >
                <T t={t} k="host.bookings.report_problem" source="Report a problem" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {paymentProgress ? (
        <div className="mt-6">
          <BookingPaymentProgress
            actor="HOST"
            progress={{
              bookingId: paymentProgress.id,
              status: paymentProgress.status,
              checkIn: paymentProgress.checkIn.toISOString().slice(0, 10),
              currency: paymentProgress.currency,
              total: Number(paymentProgress.totalPrice),
              advancePaymentAmount:
                paymentProgress.advancePaymentAmount === null
                  ? null
                  : Number(paymentProgress.advancePaymentAmount),
              damageDepositAmount:
                paymentProgress.damageDepositAmount === null
                  ? null
                  : Number(paymentProgress.damageDepositAmount),
              depositPolicies: parseDepositPoliciesSnapshot(paymentProgress.depositPolicySnapshot),
              paymentStatus: paymentProgress.paymentStatus,
              paymentInstructionsStatus: paymentProgress.paymentInstructionsStatus,
              selectedPaymentMethod: paymentProgress.selectedPaymentMethod,
              paymentMethodOtherLabel: paymentMethods?.otherLabel ?? null,
              advancePaymentStatus: paymentProgress.advancePaymentStatus,
              damageDepositStatus: paymentProgress.damageDepositStatus,
              paymentStatusEvents: paymentProgress.paymentStatusEvents.map((event) => ({
                id: event.id,
                actor: event.eventType.startsWith("GUEST_") ? "GUEST" : "HOST",
                eventType: event.eventType,
                createdAt: event.createdAt.toISOString(),
              })),
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
