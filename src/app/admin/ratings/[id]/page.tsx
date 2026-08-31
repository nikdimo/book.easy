import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Star } from "lucide-react";
import { ReviewModerationControls } from "@/components/admin/review-moderation-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth-helpers";
import {
  getAdminReview,
  markReviewRead,
} from "@/lib/services/review.service";
import { formatCalendarDate, formatDate, formatPrice } from "@/lib/utils/format";

export default async function AdminRatingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const review = await getAdminReview(id);
  if (!review) notFound();
  await markReviewRead(id, admin.id);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/ratings">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Ratings &amp; reviews
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap gap-2">
          <Badge>{review.status.replaceAll("_", " ")}</Badge>
          <Badge variant="outline">
            {review.direction === "GUEST_TO_HOST" ? "Guest → host" : "Host → guest"}
          </Badge>
          {review.publishedAt ? <Badge variant="secondary">PUBLIC</Badge> : null}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{review.listing.title}</h1>
        <p className="text-muted-foreground">
          Submitted {formatDate(review.submittedAt)} · Booking{" "}
          {review.booking.id.slice(0, 8).toUpperCase()}
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Author</span>
          <p>{review.author ? `${review.author.name} · ${review.author.email}` : "Deleted user"}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Rated party</span>
          <p>
            {review.subjectUser
              ? `${review.subjectUser.name} · ${review.subjectUser.email}`
              : "Deleted user"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Stay</span>
          <p className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            {formatCalendarDate(review.booking.checkIn)} – {formatCalendarDate(review.booking.checkOut)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Booking value</span>
          <p>{formatPrice(Number(review.booking.totalPrice))}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category ratings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {review.ratings
            .slice()
            .sort((a, b) => a.category.localeCompare(b.category))
            .map((rating) => (
              <div key={rating.id} className="flex items-center justify-between rounded-lg bg-muted p-3">
                <span>{rating.category.replaceAll("_", " ")}</span>
                <span className="flex items-center gap-1 font-semibold">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                  {rating.score}/5
                </span>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public comment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{review.publicComment}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Private feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {review.privateNote || "No private note was submitted."}
          </p>
        </CardContent>
      </Card>

      {review.moderationNote ? (
        <Card>
          <CardHeader><CardTitle>Moderation history</CardTitle></CardHeader>
          <CardContent>
            <p>{review.moderationNote}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {review.approvedBy ? `Last moderated by ${review.approvedBy.name}` : ""}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <ReviewModerationControls reviewId={review.id} status={review.status} />
    </div>
  );
}
