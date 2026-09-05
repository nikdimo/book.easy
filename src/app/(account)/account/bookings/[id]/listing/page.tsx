import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import { AmenityList } from "@/components/public/amenity-list";
import { HouseRulesList } from "@/components/public/house-rules-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth-helpers";
import {
  houseRulesSnapshot,
  parseHouseRulesSnapshot,
} from "@/lib/host/v2/listing-house-rules";
import { getT, T, TWithValues } from "@/lib/i18n/t";
import { getBookingParticipantListing } from "@/lib/services/property.service";

export const metadata = { title: "The place you booked" };

/**
 * The listing behind a booking, for the two people who are in that booking.
 *
 * A guest's booking page links to the photo of the place they are staying in, and that
 * link went to `/properties/[slug]` — a public route whose read filters on
 * `status: APPROVED`. A host who unpublishes, or an admin who suspends, therefore turned
 * a confirmed guest's own booking photo into a 404. Honouring the existing booking is
 * right; leaving the guest with no way to look at what they booked is not.
 *
 * The fix is *not* to let the public read return non-approved listings to signed-in
 * participants. That read is `cache()`-memoised behind the public property route, and a
 * listing is very often non-approved precisely because it was suspended for a safety
 * reason — public invisibility is the point. So the public read stays public, and this
 * page authorises on the only thing that justifies access: membership of the booking.
 *
 * **Read the caveat below, because the page says it too.** This shows the listing as it
 * stands today, not as it was sold. The booking freezes its house rules, payment methods
 * and policies, but not the listing's own photos and description, so a host who has since
 * changed them changes what this page shows. Rendering from a booking-time listing
 * snapshot is the better answer and needs a schema change of its own.
 */
export default async function BookingListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUserPage(`/account/bookings/${id}/listing`);
  const booking = await getBookingParticipantListing(id, user.id);
  if (!booking) notFound();

  const translator = await getT();
  const listing = booking.listing;
  const cover = listing.images[0];
  // The rules this booking actually agreed to when it recorded them, and the listing's
  // current ones only when it did not. Never today's rules over a guest's frozen copy.
  const rules =
    parseHouseRulesSnapshot(booking.houseRulesSnapshot) ??
    houseRulesSnapshot(listing);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/account/bookings/${id}`}>
          <ArrowLeft className="mr-1 size-4" aria-hidden />
          <T t={translator} k="account.booking.listing.back" source="Back to booking" />
        </Link>
      </Button>

      <Card className="overflow-hidden">
        {cover?.url ? (
          <div className="relative h-56 sm:h-72">
            <Image
              src={cover.url}
              alt={cover.alt || listing.title}
              fill
              sizes="(max-width: 672px) 100vw, 672px"
              className="object-cover"
            />
          </div>
        ) : null}
        <CardHeader>
          <CardTitle>{listing.title}</CardTitle>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {[listing.property.city, listing.property.country]
              .filter(Boolean)
              .join(", ")}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4 shrink-0" aria-hidden />
            <TWithValues
              t={translator}
              k="account.booking.listing.capacity"
              source="Sleeps up to {guests}"
              values={{ guests: listing.maxGuests }}
            />
          </p>

          {listing.description ? (
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
          ) : null}

          <HouseRulesList t={translator} rules={rules} />

          <AmenityList amenities={listing.amenities} />

          {listing.images.length > 1 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {listing.images.slice(1).map((image) => (
                <div key={image.id} className="relative aspect-[4/3]">
                  <Image
                    src={image.url}
                    alt={image.alt || listing.title}
                    fill
                    sizes="(max-width: 672px) 50vw, 224px"
                    className="rounded-md object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/*
            Said plainly, because it is true and the guest cannot tell from the page.
            The photos and description are the host's current ones; only the rules above
            come from what this booking actually agreed to.
          */}
          <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
            <T
              t={translator}
              k="account.booking.listing.current_note"
              source="This is how the host describes the place today. Photos and the description can change after a booking is made; your booking's own terms are on the booking page."
            />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
