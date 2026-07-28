import Link from "next/link";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { requireAdminPage } from "@/lib/auth-helpers";
import { listAdminReviews } from "@/lib/services/review.service";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Ratings & Reviews" };

const filters = ["ALL", "PENDING_ADMIN", "APPROVED", "REJECTED", "HIDDEN"] as const;

export default async function AdminRatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const requested = typeof query.status === "string" ? query.status : "ALL";
  const active = filters.includes(requested as (typeof filters)[number])
    ? (requested as (typeof filters)[number])
    : "ALL";
  const reviews = await listAdminReviews(admin.id);
  const visible =
    active === "ALL" ? reviews : reviews.filter((review) => review.status === active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ratings &amp; reviews</h1>
        <p className="mt-1 text-muted-foreground">
          Review sealed guest and host feedback before anything becomes public.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter}
            href={filter === "ALL" ? "/admin/ratings" : `/admin/ratings?status=${filter}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              active === filter ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {filter.replaceAll("_", " ")}
          </Link>
        ))}
      </div>

      {!visible.length ? (
        <EmptyState
          title="No ratings in this queue"
          description="New post-stay ratings will appear here with their complete booking context."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((review) => {
            const overall = review.ratings.find(
              (rating) => rating.category === "OVERALL"
            )?.score;
            const unread = review.adminReads.length === 0;
            return (
              <Link key={review.id} href={`/admin/ratings/${review.id}`}>
                <Card className="mb-3 transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {unread ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-label="Unread" />
                        ) : null}
                        <Badge>{review.status.replaceAll("_", " ")}</Badge>
                        <Badge variant="outline">
                          {review.direction === "GUEST_TO_HOST"
                            ? "Guest → host"
                            : "Host → guest"}
                        </Badge>
                      </div>
                      <p className="mt-2 font-semibold">{review.listing.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {review.author?.name || "Deleted user"} →{" "}
                        {review.subjectUser?.name || "Deleted user"} · Booking{" "}
                        {review.booking.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm">{review.publicComment}</p>
                    </div>
                    <div className="text-right">
                      <p className="flex items-center justify-end gap-1 text-lg font-semibold">
                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        {overall ?? "—"}/5
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(review.submittedAt)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
