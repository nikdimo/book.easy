import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingPromotionForm } from "@/components/host/listing-promotion-form";

export const metadata = { title: "Special Offer" };

export default async function ListingPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.isHost) redirect("/account/become-host");

  const { id } = await params;
  const listing = await db.listing.findFirst({
    where: { id, hostId: session.user.id },
    include: {
      pricingRule: true,
      promotions: {
        where: { disabledAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!listing) notFound();

  const promotion = listing.promotions[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/host/listings">
          <ArrowLeft className="mr-2 size-4" />
          My listings
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Special offer</h1>
        <p className="mt-1 text-muted-foreground">{listing.title}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promote this listing</CardTitle>
        </CardHeader>
        <CardContent>
          {listing.status === "APPROVED" && listing.pricingRule ? (
            <ListingPromotionForm
              listingId={listing.id}
              cleaningFee={Number(listing.pricingRule.cleaningFee)}
              listingMinimumNights={listing.pricingRule.minNights}
              initialPromotion={
                promotion
                  ? {
                      type: promotion.type,
                      discountPercent: promotion.discountPercent,
                      minimumNights: promotion.minimumNights,
                    }
                  : null
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Publish this listing and configure its pricing before adding a special
              offer.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
