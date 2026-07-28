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

export const metadata = { title: "After your stay" };

function StatusPanel({
  status,
  otherPartySubmitted,
  deadline,
}: {
  status: string;
  otherPartySubmitted: boolean;
  deadline: Date;
}) {
  const copy =
    status === "PENDING_ADMIN"
      ? {
          title: "Your rating is awaiting admin approval",
          body: otherPartySubmitted
            ? "Both sides have submitted. The ratings stay sealed until moderation is complete."
            : "Your rating is sealed. We have invited the other party to submit theirs.",
          icon: ShieldCheck,
        }
      : status === "APPROVED"
        ? {
            title: "Your rating was approved",
            body: otherPartySubmitted
              ? "Both sides submitted. The ratings will unlock as soon as moderation is complete."
              : `It will publish when the other party submits or after ${formatDate(deadline)}.`,
            icon: CheckCircle2,
          }
        : status === "REJECTED"
          ? {
              title: "Your review was not approved",
              body: "Check the moderation explanation below. Your private category feedback remains available to administrators.",
              icon: ShieldCheck,
            }
          : {
              title: "Your rating is hidden",
              body: "An administrator has removed this rating from public view.",
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
              : "/host/bookings"
          }
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to booking
        </Link>
      </Button>

      <div>
        <Badge variant="secondary">Stay completed</Badge>
        <h1 className="mt-3 text-3xl font-bold">The stay has ended</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
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
          <CardTitle>{booking.listing.title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Booking reference {booking.id.slice(0, 8).toUpperCase()}
          </p>
        </CardHeader>
        <CardContent>
          {ownReview ? (
            <div className="space-y-4">
              <StatusPanel
                status={ownReview.status}
                otherPartySubmitted={otherPartySubmitted}
                deadline={deadline}
              />
              {ownReview.moderationNote ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <p className="font-medium">Admin note</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ownReview.moderationNote}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-sm font-medium">Your public review</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
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
            <CardTitle>Rating from {otherParty.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {overall ? (
              <div className="mb-3 flex items-center gap-2">
                <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                <span className="text-lg font-semibold">{overall}/5</span>
              </div>
            ) : null}
            <p className="whitespace-pre-wrap">{otherReview.publicComment}</p>
          </CardContent>
        </Card>
      ) : ownReview && otherPartySubmitted ? (
        <div className="flex gap-3 rounded-xl border p-4 text-sm text-muted-foreground">
          <LockKeyhole className="h-5 w-5 shrink-0 text-primary" />
          The other rating is safely sealed and will appear after admin approval.
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
              <span className="block font-semibold">New expense request</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Request extra payment or a partial refund
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
              <span className="block font-semibold">New damage claim</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Report damage with photos and receipts
              </span>
            </span>
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-1">
          <div>
            <p className="font-medium">Final booking total</p>
            <p className="text-sm text-muted-foreground">
              Extra requests remain separate until accepted and resolved.
            </p>
          </div>
          <p className="text-xl font-semibold">
            {formatPrice(Number(booking.totalPrice))}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
