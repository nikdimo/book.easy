import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserFavoriteListings } from "@/lib/services/favorite.service";
import { PropertyCard } from "@/components/public/property-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

export const metadata = { title: "My Favorites" };

export default async function MyFavoritesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const listings = await getUserFavoriteListings(session.user.id);

  if (listings.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">My Favorites</h1>
        <EmptyState
          icon={Heart}
          title="No favorites yet"
          description="Tap the heart on any listing to save it here."
        >
          <Button asChild>
            <Link href="/properties">Browse Properties</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Favorites</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-10 max-w-6xl">
        {listings.map((listing) => (
          <PropertyCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}
