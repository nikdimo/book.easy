import "server-only";
import { db } from "@/lib/db";

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "space"
  );
}

/** A slug for a new room type that no existing row has taken. */
export async function uniqueRoomTypeKey(name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (
      await db.roomType.findMany({
        where: { key: { startsWith: base } },
        select: { key: true },
      })
    ).map((row) => row.key),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 200; suffix += 1) {
    if (!taken.has(`${base}_${suffix}`)) return `${base}_${suffix}`;
  }
  return `${base}_${Date.now()}`;
}

export async function uniqueRoomCategoryKey(name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (
      await db.roomTypeCategory.findMany({
        where: { key: { startsWith: base } },
        select: { key: true },
      })
    ).map((row) => row.key),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 200; suffix += 1) {
    if (!taken.has(`${base}_${suffix}`)) return `${base}_${suffix}`;
  }
  return `${base}_${Date.now()}`;
}
