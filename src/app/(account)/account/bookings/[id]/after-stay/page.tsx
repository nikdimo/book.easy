import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Hammer,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Star,
} from "lucide-react";
import { RatingForm } from "@/components/reviews/rating-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth-helpers";
import { getPostStayReviewContext } from "@/lib/services/review.service";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { formatMoney } from "@/lib/currency/convert";
import { getT, T, TWithValues, t, ti, type Translator } from "@/lib/i18n/t";

export const metadata = { title: "After your stay" };

function StatusPanel({
  translator,
  status,
  otherPartySubmitted,
  deadline,
}: {
  translator: Translator;
  status: string;
  otherPartySubmitted: boolean;
  deadline: Date;
}) {
  const copy =
    status === "PENDING_ADMIN"
      ? {
          title: t(translator, "account.after_stay.pending_title", "Your rating is awaiting admin approval"),
          body: otherPartySubmitted
            ? t(translator, "account.after_stay.pending_both", "Both sides have submitted. The ratings stay sealed until moderation is complete.")
            : t(translator, "account.after_stay.pending_other", "Your rating is sealed. We have invited the other party to submit theirs."),
          icon: ShieldCheck,
        }
      : status === "APPROVED"
        ? {
            title: t(translator, "account.after_stay.approved_title", "Your rating was approved"),
            body: otherPartySubmitted
              ? t(translator, "account.after_stay.approved_both", "Both sides submitted. The ratings will unlock as soon as moderation is complete.")
              : ti(translator, "account.after_stay.publish_deadline", "It will publish when the other party submits or after {date}.", { date: formatDate(deadline, translator.locale) }).text,
            icon: CheckCircle2,
          }
        : status === "REJECTED"
          ? {
              title: t(translator, "account.after_stay.rejected_title", "Your review was not approved"),
              body: t(translator, "account.after_stay.rejected_body", "Check the moderation explanation below. Your private category feedback remains available to administrators."),
              icon: ShieldCheck,
            }
          : {
              title: t(translator, "account.after_stay.hidden_title", "Your rating is hidden"),
              body: t(translator, "account.after_stay.hidden_body", "An administrator has removed this rating from public view."),
              icon: LockKeyhole,
            };
  const Icon = copy.icon;
  return (
    <div className="rounded-2xl border bg-muted/40 p-5">
      <Icon className="h-7 w-7 text-primary" />
      <h2 className="mt-3 text-lg font-semibold">{copy.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
    </div>
  );
}

export default async function AfterStayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const translator = await getT();
  const user = await requireUserPage();
  const { id } = await params;
  let context;
  try {
    context = await getPostStayReviewContext(id, user.id);
  } catch {
    notFound();
  }

  const { booking, direction, ownReview, otherReview, otherPartySubmitted, deadline } =
    context;
  const otherParty =
    direction === "GUEST_TO_HOST" ? booking.listing.host : booking.guest;
  const overall = otherReview?.ratings.find(
    (rating) => rating.category === "OVERALL"
  )?.score;
  const claimBase = `/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${booking.id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link
          href={
            direction === "GUEST_TO_HOST"
              ? `/account/bookings/${booking.id}`
              : "/host/reservations"
          }
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          <T t={translator} k="account.after_stay.back" source="Back to booking" />
        </Link>
      </Button>

      <div>
        <Badge variant="secondary"><T t={translator} k="account.after_stay.completed" source="Stay completed" /></Badge>
        <h1 className="mt-3 text-3xl font-bold"><T t={translator} k="account.after_stay.ended" source="The stay has ended" /></h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {formatDate(booking.checkIn, translator.locale)} – {formatDate(booking.checkOut, translator.locale)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {[booking.listing.property.area, booking.listing.property.city]
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
      </div>

      <Card className="border-primary/20">
        <CardHeader className="border-b">
          <CardTitle><span data-user-generated-content translate="yes">{booking.listing.title}</span></CardTitle>
          <p className="text-xs text-muted-foreground">
            {ti(translator, "account.after_stay.reference", "Booking reference {reference}", { reference: booking.reference }).text}
          </p>
        </CardHeader>
        <CardContent>
          {ownReview ? (
            <div className="space-y-4">
              <StatusPanel
                translator={translator}
                status={ownReview.status}
                otherPartySubmitted={otherPartySubmitted}
                deadline={deadline}
              />
              {ownReview.moderationNote ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <p className="font-medium"><T t={translator} k="account.after_stay.admin_note" source="Admin note" /></p>
                  <p className="mt-1 text-sm text-muted-foreground" data-user-generated-content translate="yes">
                    {ownReview.moderationNote}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-sm font-medium"><T t={translator} k="account.after_stay.your_review" source="Your public review" /></p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground" data-user-generated-content translate="yes">
                  {ownReview.publicComment}
                </p>
              </div>
            </div>
          ) : (
            <RatingForm
              bookingId={booking.id}
              direction={direction}
              otherPartyName={otherParty.name}
            />
          )}
        </CardContent>
      </Card>

      {otherReview ? (
        <Card>
          <CardHeader>
            <CardTitle>{ti(translator, "account.after_stay.rating_from", "Rating from {name}", { name: otherParty.name }).text}</CardTitle>
          </CardHeader>
          <CardContent>
            {overall ? (
              <div className="mb-3 flex items-center gap-2">
                <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                <span className="text-lg font-semibold">{overall}/5</span>
              </div>
            ) : null}
            <p className="whitespace-pre-wrap" data-user-generated-content translate="yes">{otherReview.publicComment}</p>
          </CardContent>
        </Card>
      ) : ownReview && otherPartySubmitted ? (
        <div className="flex gap-3 rounded-xl border p-4 text-sm text-muted-foreground">
          <LockKeyhole className="h-5 w-5 shrink-0 text-primary" />
          <T t={translator} k="account.after_stay.other_sealed" source="The other rating is safely sealed and will appear after admin approval." />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          size="lg"
          className="h-auto justify-start px-4 py-4"
          asChild
        >
          <Link href={`${claimBase}&claimKind=EXPENSE`}>
            <Banknote className="mr-2 h-5 w-5 text-primary" />
            <span className="text-left">
              <span className="block font-semibold"><T t={translator} k="account.after_stay.expense_title" source="New expense request" /></span>
              <span className="block text-xs font-normal text-muted-foreground">
                <T t={translator} k="account.after_stay.expense_description" source="Request extra payment or a partial refund" />
              </span>
            </span>
          </Link>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-auto justify-start px-4 py-4"
          asChild
        >
          <Link href={`${claimBase}&claimKind=DAMAGE`}>
            <Hammer className="mr-2 h-5 w-5 text-primary" />
            <span className="text-left">
              <span className="block font-semibold"><T t={translator} k="account.after_stay.damage_title" source="New damage claim" /></span>
              <span className="block text-xs font-normal text-muted-foreground">
                <T t={translator} k="account.after_stay.damage_description" source="Report damage with photos and receipts" />
              </span>
            </span>
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium"><T t={translator} k="account.after_stay.final_total" source="Final booking total" /></p>
              <p className="text-sm text-muted-foreground">
                <T t={translator} k="account.after_stay.total_note" source="Extra requests remain separate until accepted and resolved." />
              </p>
            </div>
            <p className="text-xl font-semibold">
              {formatPrice(Number(booking.totalPrice), booking.currency, translator.locale)}
            </p>
          </div>
          {/* The booking is agreed in the listing's currency. This mirrors the frozen
              display-currency figure shown on the confirmation page — never
              recalculated at today's rate, so reopening this page never changes what
              it says. */}
          {booking.displayCurrency && booking.displayTotal ? (
            <p className="mt-2 text-right text-xs text-muted-foreground">
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
        </CardContent>
      </Card>
    </div>
  );
}
