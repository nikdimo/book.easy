import {
  BedDouble,
  Building2,
  Castle,
  CircleHelp,
  Factory,
  Hotel,
  House,
  Landmark,
  PanelsTopLeft,
  School,
  Store,
  Tent,
  TreePine,
  Warehouse,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { PropertyTypeIconName } from "@/lib/property-type-icons";

const PROPERTY_TYPE_ICON_COMPONENTS = {
  BedDouble,
  Building2,
  Castle,
  CircleHelp,
  Factory,
  Hotel,
  House,
  Landmark,
  PanelsTopLeft,
  School,
  Store,
  Tent,
  TreePine,
  Warehouse,
} satisfies Record<PropertyTypeIconName, ComponentType<LucideProps>>;

export function PropertyTypeIcon({
  name,
  ...props
}: LucideProps & { name?: string | null }) {
  const Icon =
    PROPERTY_TYPE_ICON_COMPONENTS[name as PropertyTypeIconName] ?? Building2;
  return <Icon aria-hidden="true" {...props} />;
}
