import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ListingForm } from "@/components/host/listing-form";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { getHostListingDraft } from "@/lib/services/listing.service";
import type { ListingDraftData } from "@/lib/types/listing-draft";

export const metadata = { title: "Create Listing" };

interface NewListingPageProps {
  searchParams: Promise<{ draft?: string }>;
}

export default async function NewListingPage({ searchParams }: NewListingPageProps) {
  const session = await auth();
  if (!session?.user?.isHost) redirect("/account/become-host");

  const { draft: draftIdParam } = await searchParams;

  const [amenities, propertyTypes, cityRows, draft] = await Promise.all([
    db.amenity.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    getActivePropertyTypes(),
    db.property.findMany({
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    }),
    draftIdParam ? getHostListingDraft(draftIdParam, session.user.id) : null,
  ]);
  const availableCities = cityRows.map((row) => row.city);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create a New Listing</h1>
      <ListingForm
        amenities={amenities}
        propertyTypes={propertyTypes}
        availableCities={availableCities}
        initialImageUrls={[]}
        draftId={draft?.id}
        initialDraft={draft?.data as ListingDraftData | undefined}
      />
    </div>
  );
}
