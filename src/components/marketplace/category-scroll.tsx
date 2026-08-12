import Link from "next/link";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { PropertyTypeIcon } from "@/components/shared/property-type-icon";
import { getT } from "@/lib/i18n/t";
import { resolvePropertyTypeLabel } from "@/lib/i18n/property-type-labels";

export async function CategoryScroll() {
  const [propertyTypes, t] = await Promise.all([getActivePropertyTypes(), getT()]);
  return (
    <div className="w-full overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
      <div className="flex gap-8 md:gap-10 min-w-max justify-center md:justify-start md:px-2">
        {propertyTypes.map((type) => {
          const label = resolvePropertyTypeLabel(t, type.value, type.label);
          return (
            <Link
              key={type.value}
              href={`/properties?propertyTypes=${encodeURIComponent(type.value)}`}
              className="flex flex-col items-center gap-2 min-w-[64px] group"
            >
              <PropertyTypeIcon
                name={type.icon}
                className="h-7 w-7 shrink-0 text-muted-foreground opacity-80 transition-opacity group-hover:text-foreground group-hover:opacity-100"
              />
              <span
                className={`text-xs font-medium text-muted-foreground group-hover:text-foreground border-b-2 border-transparent group-hover:border-foreground pb-1 transition-colors whitespace-nowrap${
                  label.translated ? " notranslate" : ""
                }`}
              >
                {label.text}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
