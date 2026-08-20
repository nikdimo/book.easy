import { createElement } from "react";
import { Shapes, type LucideProps } from "lucide-react";
import { amenityIcon } from "@/lib/amenities/icon-registry";

/**
 * The icon for a room type or its group, resolved from the stored key.
 *
 * A component rather than a `const Icon = amenityIcon(key)` at each call site: resolving
 * the component inside JSX makes React treat every paint as a new component type and
 * throw its state away. Built with `createElement` for the same reason the registry's own
 * renderer is — a registry lookup is a runtime value, and assigning it to a capitalised
 * local so JSX can use it is exactly the shape `react-hooks/static-components` rejects.
 */
// `name` is omitted from LucideProps first: SVG elements already carry a `name` attribute
// typed as a plain string, and intersecting it with a nullable one makes the prop
// unusable at every call site that passes a nullable icon key from the database.
export function SpaceIcon({
  name,
  ...props
}: Omit<LucideProps, "name"> & { name?: string | null }) {
  return createElement(amenityIcon(name) ?? Shapes, { "aria-hidden": true, ...props });
}
