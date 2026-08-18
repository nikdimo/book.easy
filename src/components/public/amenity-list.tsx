import { getT, T } from "@/lib/i18n/t";
import { amenityIcon } from "@/lib/amenities/icon-registry";
import { resolveAmenityLabels } from "@/lib/services/amenity.service";

interface AmenityListProps {
  amenities: {
    amenity: { name: string; icon: string | null; category: { name: string } };
  }[];
}

export async function AmenityList({ amenities }: AmenityListProps) {
  if (amenities.length === 0) return null;
  const [t, resolved] = await Promise.all([
    getT(),
    resolveAmenityLabels(amenities.map((entry) => entry.amenity)),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        <T t={t} k="listing.amenities_heading" source="What this place offers" />
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-6 gap-y-3">
        {resolved.map((amenity) => {
          const Icon = amenityIcon(amenity.icon);
          return (
            <div key={amenity.name} className="flex items-center gap-3 py-1">
              {Icon ? (
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted shrink-0" />
              )}
              <span className={amenity.translated ? "notranslate text-sm" : "text-sm"}>
                {amenity.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
