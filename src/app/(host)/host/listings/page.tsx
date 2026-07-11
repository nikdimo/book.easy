import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Calendar, Eye, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHostListings, getHostListingDrafts } from "@/lib/services/listing.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteListingButton } from "@/components/host/delete-listing-button";
import { DeleteDraftButton } from "@/components/host/delete-draft-button";
import { formatPrice, formatDate } from "@/lib/utils/format";
import { LISTING_STATUSES } from "@/lib/constants";
import type { ListingDraftData } from "@/lib/types/listing-draft";

export const metadata = { title: "My Listings" };

export default async function HostListingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [listings, drafts] = await Promise.all([
    getHostListings(session.user.id),
    getHostListingDrafts(session.user.id),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Listings</h1>
        <Button asChild>
          <Link href="/host/listings/new"><Plus className="h-4 w-4 mr-2" />New Listing</Link>
        </Button>
      </div>

      {drafts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            In-progress drafts
            <Badge variant="secondary">{drafts.length}</Badge>
          </h2>
          <div className="space-y-3">
            {drafts.map((draft) => {
              const data = draft.data as ListingDraftData;
              const title = data.title?.trim() || "Untitled draft";
              return (
                <Card key={draft.id}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{title}</h3>
                        <Badge variant="secondary">Draft</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Last edited {formatDate(draft.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/host/listings/new?draft=${draft.id}`}>
                          <Pencil className="h-3 w-3 mr-1" />
                          Continue
                        </Link>
                      </Button>
                      <DeleteDraftButton draftId={draft.id} title={title} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {listings.length === 0 && drafts.length === 0 ? (
        <EmptyState
          title="No listings yet"
          description="Create your first listing to start receiving bookings."
        >
          <Button asChild>
            <Link href="/host/listings/new">Create Listing</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => {
            const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);
            return (
              <Card key={listing.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{listing.title}</h3>
                      <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
                        {statusConfig?.label || listing.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {listing.property.city}
                      {listing.pricingRule && ` · ${formatPrice(Number(listing.pricingRule.baseNightlyRate))}/night`}
                      {` · ${listing._count.bookings} booking${listing._count.bookings !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/host/listings/${listing.id}/edit`}>Edit</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/host/listings/${listing.id}/availability`}>
                        <Calendar className="h-3 w-3" />
                      </Link>
                    </Button>
                    {listing.status === "APPROVED" && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/properties/${listing.slug}`}>
                          <Eye className="h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                    <DeleteListingButton listingId={listing.id} title={listing.title} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
