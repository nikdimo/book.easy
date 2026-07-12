"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DeleteListingButton } from "@/components/host/delete-listing-button";
import { UnpublishListingButton } from "@/components/host/unpublish-listing-button";
import { formatPrice } from "@/lib/utils/format";
import { LISTING_STATUSES } from "@/lib/constants";

interface HostListingCardProps {
  listing: {
    id: string;
    slug: string;
    title: string;
    status: string;
    property: { city: string };
    pricingRule: { baseNightlyRate: number } | null;
    _count: { bookings: number };
  };
}

export function HostListingCard({ listing }: HostListingCardProps) {
  const router = useRouter();
  const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);
  const editHref = `/host/listings/${listing.id}/edit`;

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={() => router.push(editHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(editHref);
      }}
      className="cursor-pointer transition-colors hover:bg-muted/40"
    >
      <CardContent className="flex flex-col items-stretch gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate">{listing.title}</h3>
            <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
              {statusConfig?.label || listing.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {listing.property.city}
            {listing.pricingRule &&
              ` · ${formatPrice(Number(listing.pricingRule.baseNightlyRate))}/night`}
            {` · ${listing._count.bookings} booking${listing._count.bookings !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0" onClick={stop}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" asChild>
                <Link href={editHref}>Edit</Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit listing</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/host/listings/${listing.id}/availability`}>
                  <Calendar className="h-3 w-3" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Availability &amp; pricing</TooltipContent>
          </Tooltip>

          {listing.status === "APPROVED" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/properties/${listing.slug}`}>
                    <Eye className="h-3 w-3" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preview</TooltipContent>
            </Tooltip>
          )}

          {listing.status === "APPROVED" && (
            <UnpublishListingButton listingId={listing.id} title={listing.title} />
          )}

          <DeleteListingButton listingId={listing.id} title={listing.title} />
        </div>
      </CardContent>
    </Card>
  );
}
