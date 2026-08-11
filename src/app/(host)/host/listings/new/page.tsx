import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ListingForm } from "@/components/host/listing-form";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { getHostListingDraft } from "@/lib/services/listing.service";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import { getExchangeRates, quotableCurrencies } from "@/lib/currency/rates";

export const metadata = { title: "Create Listing" };

interface NewListingPageProps {
  searchParams: Promise<{ draft?: string }>;
}

export default async function NewListingPage({ searchParams }: NewListingPageProps) {
  const session = await auth();
  if (!session?.user?.isHost) redirect("/account/become-host");

  const { draft: draftIdParam } = await searchParams;

  const [amenities, propertyTypes, draft, rates] = await Promise.all([
    db.amenity.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    getActivePropertyTypes(),
    draftIdParam ? getHostListingDraft(draftIdParam, session.user.id) : null,
    getExchangeRates(),
  ]);

  return (
    <div className="listing-studio h-full min-h-0 overflow-hidden">
      <ListingForm
        key={draft?.id ?? "new-listing"}
        currencies={quotableCurrencies(rates)}
        amenities={amenities}
        propertyTypes={propertyTypes}
        initialMediaItems={[]}
        draftId={draft?.id}
        initialDraft={draft?.data as ListingDraftData | undefined}
      />
    </div>
  );
}
