"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DeleteListingButton } from "@/components/host/delete-listing-button";
import {
  ListingVisibilityToggle,
  isHostVisibilityToggleable,
} from "@/components/host/listing-visibility-toggle";
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
  const statusLabel = statusConfig?.label || listing.status;
  const canToggleVisibility = isHostVisibilityToggleable(listing.status);

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
            <Badge
              variant={listing.status === "APPROVED" ? "default" : "secondary"}
            >
              <span className="notranslate" translate="no">
                {statusLabel}
              </span>
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {listing.property.city}
            {listing.pricingRule &&
              ` · ${formatPrice(Number(listing.pricingRule.baseNightlyRate))}/night`}
            {` · ${listing._count.bookings} booking${listing._count.bookings !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 shrink-0"
          onClick={stop}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" asChild>
                <Link href={editHref}>
                  <span className="notranslate" translate="no">
                    Edit
                  </span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit listing</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/host/listings/${listing.id}/availability`}
                  aria-label={`Manage availability, pricing, and promotions for ${listing.title}`}
                >
                  <Calendar className="h-3 w-3" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Calendar, pricing &amp; promotions</TooltipContent>
          </Tooltip>

          {listing.status === "APPROVED" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/properties/${listing.slug}`}
                    aria-label={`Preview ${listing.title}`}
                  >
                    <Eye className="h-3 w-3" />
                    <span className="notranslate" translate="no">
                      Preview
                    </span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Open the public page for this listing, exactly as guests see it.
              </TooltipContent>
            </Tooltip>
          )}

          {canToggleVisibility && (
            <ListingVisibilityToggle
              listingId={listing.id}
              title={listing.title}
              status={listing.status}
            />
          )}

          <DeleteListingButton listingId={listing.id} title={listing.title} />
        </div>
      </CardContent>
    </Card>
  );
}
