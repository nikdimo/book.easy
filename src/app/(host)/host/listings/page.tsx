import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Calendar, Eye } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHostListings } from "@/lib/services/listing.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteListingButton } from "@/components/host/delete-listing-button";
import { formatPrice } from "@/lib/utils/format";
import { LISTING_STATUSES } from "@/lib/constants";

export const metadata = { title: "My Listings" };

export default async function HostListingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const listings = await getHostListings(session.user.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Listings</h1>
        <Button asChild>
          <Link href="/host/listings/new"><Plus className="h-4 w-4 mr-2" />New Listing</Link>
        </Button>
      </div>

      {listings.length === 0 ? (
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
