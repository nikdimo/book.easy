import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ListingForm } from "@/components/host/listing-form";

export const metadata = { title: "Create Listing" };

export default async function NewListingPage() {
  const session = await auth();
  if (!session?.user?.isHost) redirect("/account/become-host");

  const amenities = await db.amenity.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create a New Listing</h1>
      <ListingForm amenities={amenities} initialImageUrls={[]} />
    </div>
  );
}
