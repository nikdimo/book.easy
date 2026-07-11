import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ListingForm } from "@/components/host/listing-form";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";

export const metadata = { title: "Create Listing" };

export default async function NewListingPage() {
  const session = await auth();
  if (!session?.user?.isHost) redirect("/account/become-host");

  const amenities = await db.amenity.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const propertyTypes = await getActivePropertyTypes();
  const cityRows = await db.property.findMany({
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  const availableCities = cityRows.map((row) => row.city);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create a New Listing</h1>
      <ListingForm
        amenities={amenities}
        propertyTypes={propertyTypes}
        availableCities={availableCities}
        initialImageUrls={[]}
      />
    </div>
  );
}
