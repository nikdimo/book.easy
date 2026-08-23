import "server-only";
import { db } from "@/lib/db";

/** Where a label lands when no rule below recognises it. */
export const FALLBACK_CATEGORY_KEY = "features";

/**
 * Best guess at the category for a label nobody has mapped yet — a provider import
 * or a host suggestion.
 *
 * Ordered most specific first, because the obvious general rule usually also matches
 * the specific case: "hair dryer" has to reach Bathroom before "dryer" sends it to
 * Essentials, and "lock on bedroom door" has to reach Safety before "bed" sends it to
 * Bedroom. Anything unmatched falls through to Features, which is the one bucket an
 * admin is expected to empty by hand.
 */
const CATEGORY_RULES: [RegExp, string][] = [
  [/\b(elevator|lift|step[- ]free|wheelchair|accessib\w*|ground floor)\b/, "accessibility"],
  [/\b(crib|cot|high ?chair|children\w*|kids?|toys?|baby|stroller|pets?|dogs?|cats?|changing table|outlet covers?|corner guards?|pack .?n play)\b/, "family"],
  [/\b(smoke|carbon monoxide|extinguisher|first aid|security camera\w*|cctv|alarm|lock on|safe\b)\b/, "safety"],
  [/\b(self check|check[- ]?in|lockbox|keypad|smart lock|keys?|host greets|luggage|private entrance)\b/, "check_in"],
  [/\b(long[- ]term|breakfast|cleaning available|concierge|housekeep\w*|airport|shuttle|recycl\w*)\b/, "services"],
  [/\b(parking|garage|carport|ev charger|charging station)\b/, "parking"],
  [/(\bview\b|waterfront|beachfront|lakefront|sea access|lake access)/, "views"],
  [/\b(kitchen|oven|stove|microwave|fridge|refrigerat\w*|freezer|dishwash\w*|dishes|silverware|cutlery|cook\w*|coffee|kettle|toaster|blender|wine glass\w*|dining table|baking)\b/, "kitchen"],
  [/\b(bath|bathtub|shower|toilet|hair dryer|shampoo|conditioner|soap|towels?|toiletr\w*|bidet|hot water)\b/, "bathroom"],
  [/\b(bed|beds|linens?|sheets?|pillows?|blankets?|hangers?|wardrobe|closet|clothing storage|shades|curtains?|blackout)\b/, "bedroom"],
  [/\b(tv|television|netflix|streaming|games?|console|cinema|projector|speakers?|sound system|stereo|books?|piano)\b/, "entertainment"],
  [/\b(garden|balcony|terrace|patio|yard|barbecue|bbq|grill|outdoor|pool|hot tub|sauna|fire pit|hammock|bikes?|sun lounger\w*|backyard)\b/, "outdoor"],
  [/\b(wi[- ]?fi|internet|heating|air conditioning|washer|washing machine|dryer|drying rack|laundromat|iron|workspace|desk|laptop|cleaning products|essentials)\b/, "essentials"],
];

export function guessCategoryKey(name: string): string {
  const value = name.toLowerCase();
  for (const [pattern, key] of CATEGORY_RULES) {
    if (pattern.test(value)) return key;
  }
  return FALLBACK_CATEGORY_KEY;
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "item"
  );
}

/**
 * A slug for a new row that no existing row has taken. `alsoTaken` covers keys
 * created earlier in the same transaction, which are not visible to this read: a
 * single provider import can introduce two labels that slug to the same base.
 */
export async function uniqueAmenityKey(
  name: string,
  alsoTaken: Iterable<string> = [],
): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (
      await db.amenity.findMany({
        where: { key: { startsWith: base } },
        select: { key: true },
      })
    ).map((row) => row.key),
  );
  for (const key of alsoTaken) taken.add(key);
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 200; suffix += 1) {
    if (!taken.has(`${base}_${suffix}`)) return `${base}_${suffix}`;
  }
  return `${base}_${Date.now()}`;
}

export async function uniqueCategoryKey(name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (
      await db.amenityCategory.findMany({
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

/**
 * The category id for a guessed key, falling back to Features and then to whatever
 * category exists at all — a NOT NULL foreign key means an import must never be left
 * without one.
 */
export async function categoryIdForName(name: string): Promise<string> {
  const key = guessCategoryKey(name);
  const [preferred, fallback] = await Promise.all([
    db.amenityCategory.findUnique({ where: { key }, select: { id: true } }),
    db.amenityCategory.findUnique({
      where: { key: FALLBACK_CATEGORY_KEY },
      select: { id: true },
    }),
  ]);
  const resolved =
    preferred ??
    fallback ??
    (await db.amenityCategory.findFirst({
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    }));
  if (!resolved) throw new Error("The amenity catalog has no categories.");
  return resolved.id;
}
