import "server-only";
import { db } from "@/lib/db";

/** Turns a free-text label into a stable UPPER_SNAKE_CASE code for PropertyType.value,
 * appending a numeric suffix on collision (e.g. a second "Loft" suggestion). */
export async function uniquePropertyTypeValue(label: string): Promise<string> {
  const base =
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "TYPE";

  let candidate = base;
  let suffix = 2;
  while (await db.propertyType.findUnique({ where: { value: candidate } })) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}
