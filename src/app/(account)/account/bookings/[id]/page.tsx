import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, Users, ArrowLeft, Star } from "lucide-react";
import { auth } from "@/lib/auth";
import { getGuestBookingWithHost } from "@/lib/services/booking.service";
import {
  bookingPartyDetailLine,
  resolveBookingParty,
} from "@/lib/booking-party";
import { resolveBookingPricing } from "@/lib/booking-pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CancelBookingButton } from "@/components/account/cancel-booking-button";
import { formatCalendarDate, formatPrice } from "@/lib/utils/format";
import { formatMoney } from "@/lib/currency/convert";
import { BOOKING_STATUSES } from "@/lib/constants";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import { BookingStatusHero } from "@/components/booking/booking-status-hero";
import { BookingArrivalDetails } from "@/components/booking/booking-arrival-details";
import { BookingArrivalGuide } from "@/components/booking/booking-arrival-guide";
import {
  AcceptedPaymentMethods,
  acceptedPaymentMethodsFromSnapshot,
} from "@/components/booking/accepted-payment-methods";
import { getT, T, TWithValues, t, ti, tPlural } from "@/lib/i18n/t";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";
import { getBookingPaymentProgress } from "@/lib/services/booking-payment-status.service";
import {
  isNoInstructionsPaymentRequestSnapshot,
  parseBookingPaymentDetailsSnapshot,
} from "@/lib/payments/booking-payment-request";
import { parseDepositPoliciesSnapshot } from "@/lib/payments/deposit-policies";
import {
  parseCancellationPolicySnapshot,
  parseCancellationSettlementSnapshot,
} from "@/lib/payments/cancellation-policy";
import { BookingPaymentProgress } from "@/components/booking/booking-payment-progress";

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
  const paymentProgress = await getBookingPaymentProgress(booking.id, session.user.id);

  const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
  const canCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const guests = tPlural(translator, "booking.guests", booking.guestCount, "{n} guest", "{n} guests");
  // What the guest count leaves out, and only when it leaves something out. A booking
  // taken before the party columns existed resolves to "not recorded" and returns null
  // here, so it keeps printing exactly the one number it has always printed rather than
  // gaining an invented "0 infants".
  const partyDetail = bookingPartyDetailLine(
    translator,
    resolveBookingParty(booking),
  );
  // One resolver, shared with the host panel and the mobile API. `nightlyRate` is a
  // rounded average and the old fallback multiplied it by the nights, which misses the
  // total by a cent or more on an uneven stay (audit L2). The rows below print the
  // *gross* accommodation and cleaning figures because the promotion has a line of its
  // own: gross + gross - discount is `totalPrice`, while the net figures beside that
  // same line would subtract the promotion twice.
  const pricing = resolveBookingPricing(booking);
  const paymentMethods = acceptedPaymentMethodsFromSnapshot(
    booking.paymentMethodsSnapshot,
    booking.createdAt,
  );

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
          /*
            The public property route only serves APPROVED listings, so this photo was a
            404 for a guest whose host had unpublished — or whose listing support had
            suspended — after the booking was made. The booking-scoped page authorises on
            membership of this booking instead, and is reachable in every state.
          */
          <Link
            href={
              booking.listing.status === "APPROVED"
                ? `/properties/${booking.listing.slug}`
                : `/account/bookings/${booking.id}/listing`
            }
            className="relative block h-56 sm:h-72"
          >
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
              <p className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />{formatCalendarDate(booking.checkIn, translator.locale)}</p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={translator} k="account.booking.check_out" source="Check-out" /></p>
              <p className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />{formatCalendarDate(booking.checkOut, translator.locale)}</p>
            </div>
            <div>
              <p className="text-muted-foreground"><T t={translator} k="account.booking.guests" source="Guests" /></p>
              <p className="font-medium flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span className={guests.translated ? "notranslate" : undefined}>{guests.text}</span>
              </p>
              {partyDetail ? (
                <p
                  className={`mt-0.5 text-xs text-muted-foreground ${partyDetail.translated ? "notranslate" : ""}`}
                >
                  {partyDetail.text}
                </p>
              ) : null}
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
              <span>{formatPrice(pricing.originalAccommodationSubtotal, booking.currency, translator.locale)}</span>
            </div>
            {pricing.originalCleaningFee > 0 && (
              <div className="flex justify-between">
                <span><T t={translator} k="account.booking.cleaning_fee" source="Cleaning fee" /></span>
                <span>{formatPrice(pricing.originalCleaningFee, booking.currency, translator.locale)}</span>
              </div>
            )}
            {pricing.discountAmount > 0 && (
              <div className="flex justify-between text-green-700">
                <span>{booking.promotionType === "FREE_CLEANING" ? t(translator, "account.booking.free_cleaning", "Free cleaning") : t(translator, "account.booking.special_offer", "Special offer")}</span>
                <span>−{formatPrice(pricing.discountAmount, booking.currency, translator.locale)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span><T t={translator} k="account.booking.total" source="Total" /></span>
              <span className="flex items-baseline gap-2">
                {booking.originalTotal && Number(booking.discountAmount) > 0 ? (
                  <span className="text-sm font-normal text-muted-foreground line-through">
                    {formatPrice(Number(booking.originalTotal), booking.currency, translator.locale)}
                  </span>
                ) : null}
                <span>{formatPrice(Number(booking.totalPrice), booking.currency, translator.locale)}</span>
              </span>
            </div>
            {booking.displayCurrency && booking.displayTotal ? (
              <p className="text-right text-xs text-muted-foreground">
                <TWithValues
                  t={translator}
                  k="booking.display_total_approx"
                  source="Approximately {amount} at the time of booking. The booking is agreed in {currency}."
                  values={{
                    amount: formatMoney(
                      Number(booking.displayTotal),
                      booking.displayCurrency,
                      translator.locale,
                      { converted: true },
                    ),
                    currency: booking.currency,
                  }}
                />
              </p>
            ) : null}
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

      {paymentProgress ? (
        <div className="mt-6">
          <BookingPaymentProgress
            actor="GUEST"
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
              cancellationPolicy: parseCancellationPolicySnapshot(
                paymentProgress.cancellationPolicySnapshot,
              ),
              cancellationSettlement: parseCancellationSettlementSnapshot(
                paymentProgress.cancellationSettlementSnapshot,
              ),
              paymentStatus: paymentProgress.paymentStatus,
              paymentInstructionsStatus: paymentProgress.paymentInstructionsStatus,
              paymentInstructionsDueAt:
                paymentProgress.paymentInstructionsDueAt?.toISOString() ?? null,
              reference: paymentProgress.reference,
              sentPaymentDetails: parseBookingPaymentDetailsSnapshot(
                paymentProgress.paymentInstructionsSnapshot,
              ),
              selectedPaymentMethod: paymentProgress.selectedPaymentMethod,
              paymentMethodOtherLabel: paymentMethods?.otherLabel ?? null,
              advancePaymentStatus: paymentProgress.advancePaymentStatus,
              damageDepositStatus: paymentProgress.damageDepositStatus,
              accommodationRefundStatus: paymentProgress.accommodationRefundStatus,
              accommodationRefundAmount:
                paymentProgress.accommodationRefundAmount === null
                  ? null
                  : Number(paymentProgress.accommodationRefundAmount),
              paymentStatusEvents: paymentProgress.paymentStatusEvents.map((event) => ({
                id: event.id,
                actor:
                  event.actorId === paymentProgress.guestId
                    ? "GUEST"
                    : event.actorId === paymentProgress.listing.hostId
                      ? "HOST"
                      : event.actorId
                        ? "ADMIN"
                        : event.eventType.startsWith("GUEST_")
                          ? "GUEST"
                          : event.eventType.startsWith("HOST_")
                            ? "HOST"
                            : "SYSTEM",
                eventType: event.eventType,
                createdAt: event.createdAt.toISOString(),
              })),
              paymentRequests: paymentProgress.paymentRequests.map((request) => ({
                id: request.id,
                type: request.type,
                amount: Number(request.amount),
                currency: request.currency,
                dueAt: request.dueAt.toISOString(),
                status: request.status,
                sentPaymentDetails: parseBookingPaymentDetailsSnapshot(
                  request.instructionsSnapshot,
                ),
                instructionsNotRequired: isNoInstructionsPaymentRequestSnapshot(
                  request.instructionsSnapshot,
                ),
                reminders: request.reminders.map((reminder) => ({
                  kind: reminder.kind,
                  sentAt: reminder.sentAt.toISOString(),
                })),
              })),
              transactionReports: paymentProgress.paymentPrivateRecords.map((report) => ({
                id: report.id,
                track: report.track,
                reporter:
                  report.reporterId === null
                    ? "REDACTED"
                    : report.reporterId === paymentProgress.guestId
                      ? "GUEST"
                      : "HOST",
                amount: Number(report.amount),
                currency: report.currency,
                transactionDate: report.transactionDate.toISOString(),
                reference: report.reference,
                note: report.note,
                retainedReason: report.retainedReason,
              })),
            }}
          />
        </div>
      ) : null}

      <AcceptedPaymentMethods
        t={translator}
        data={paymentMethods}
        appearance="card"
        headingAs="h3"
        className="mt-6"
      />

      <BookingArrivalDetails
        booking={{ status: booking.status, checkIn: booking.checkIn }}
        property={booking.listing.property}
      />

      {/* Where the place is, then how to get into it. Two cards rather than one because
          they unlock on different schedules: the address follows the exact-location rule,
          the door code follows the host's arrival guide. */}
      <BookingArrivalGuide
        listingId={booking.listing.id}
        booking={{ status: booking.status, checkIn: booking.checkIn }}
      />
    </div>
  );
}
