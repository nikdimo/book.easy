import Link from "next/link";
import { Building2, Home, Castle, TreePine, Warehouse, Tent } from "lucide-react";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";

const iconMap: Record<string, typeof Home> = {
  APARTMENT: Building2,
  HOUSE: Home,
  DETACHED_HOUSE: Home,
  ROW_HOUSE: Building2,
  HOUSE_FLOOR: Building2,
  VILLA: Castle,
  STUDIO: Warehouse,
  CABIN: TreePine,
  COTTAGE: Tent,
  LOFT: Building2,
  OTHER: Home,
};

export async function CategoryScroll() {
  const propertyTypes = await getActivePropertyTypes();
  return (
    <div className="w-full overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
      <div className="flex gap-8 md:gap-10 min-w-max justify-center md:justify-start md:px-2">
        {propertyTypes.map((type) => {
          const Icon = iconMap[type.value] ?? Home;
          return (
            <Link
              key={type.value}
              href={`/properties?propertyTypes=${encodeURIComponent(type.value)}`}
              className="flex flex-col items-center gap-2 min-w-[64px] group"
            >
              <Icon className="h-7 w-7 text-muted-foreground group-hover:text-foreground opacity-80 group-hover:opacity-100 transition-opacity shrink-0" />
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground border-b-2 border-transparent group-hover:border-foreground pb-1 transition-colors whitespace-nowrap">
                {type.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
