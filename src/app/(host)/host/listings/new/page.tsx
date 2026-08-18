import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ListingForm } from "@/components/host/listing-form";
import { getAmenityCatalog } from "@/lib/services/amenity.service";
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
    getAmenityCatalog(),
    getActivePropertyTypes(),
    draftIdParam ? getHostListingDraft(draftIdParam, session.user.id) : null,
    getExchangeRates(),
  ]);

  return (
    <div className="listing-studio h-full min-h-0 overflow-hidden">
      {/* Keyed off the URL, never off the loaded draft. Publishing deletes the
          draft row and revalidates, which re-runs this page with `draft` null —
          keying off it would flip the key, remount the form, and replace the
          "your listing is published" screen with a blank new wizard. */}
      <ListingForm
        key={draftIdParam ?? "new-listing"}
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
