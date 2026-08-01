import {
  Wifi, Wind, Thermometer, Shirt, Tv, CookingPot, Refrigerator, Microwave,
  Coffee, Sun, Trees, Car, Waves, Bath, Flame, Shield, HeartPulse,
  Mountain, Building, Laptop, LucideIcon,
} from "lucide-react";
import { getT, T } from "@/lib/i18n/t";
import { resolveAmenityLabel } from "@/lib/i18n/amenity-labels";

const iconMap: Record<string, LucideIcon> = {
  wifi: Wifi,
  wind: Wind,
  thermometer: Thermometer,
  shirt: Shirt,
  tv: Tv,
  "cooking-pot": CookingPot,
  refrigerator: Refrigerator,
  microwave: Microwave,
  coffee: Coffee,
  sun: Sun,
  trees: Trees,
  car: Car,
  waves: Waves,
  bath: Bath,
  flame: Flame,
  shield: Shield,
  "heart-pulse": HeartPulse,
  "mountain-snow": Mountain,
  building: Building,
  laptop: Laptop,
};

interface AmenityListProps {
  amenities: { amenity: { name: string; icon?: string | null; category: string } }[];
}

export async function AmenityList({ amenities }: AmenityListProps) {
  if (amenities.length === 0) return null;
  const t = await getT();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        <T t={t} k="listing.amenities_heading" source="What this place offers" />
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-6 gap-y-3">
        {amenities.map(({ amenity }) => {
          const Icon = amenity.icon ? iconMap[amenity.icon] : undefined;
          const label = resolveAmenityLabel(t, amenity.name);
          return (
            <div key={amenity.name} className="flex items-center gap-3 py-1">
              {Icon ? (
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted shrink-0" />
              )}
              <span className={label.translated ? "notranslate text-sm" : "text-sm"}>
                {label.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
