import type { Prisma } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHost } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  copyImportedImages,
  importListingUrl,
} from "@/lib/listing-import/importer";
import { getStorageAdapter } from "@/lib/storage";
import { AMENITIES_TAG } from "@/lib/services/amenity.service";
import { isSupportedCurrency } from "@/lib/currency/currencies";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().trim().url().max(2_000),
  rightsConfirmed: z.literal(true),
});

const AMENITY_ALIASES: Record<string, string> = {
  airconditioning: "Air conditioning",
  barbeque: "BBQ grill",
  barbecue: "BBQ grill",
  bbq: "BBQ grill",
  dedicatedworkspace: "Workspace",
  fireextinguisher: "Fire extinguisher",
  firstaidkit: "First aid kit",
  freeparkingonpremises: "Free parking",
  hottub: "Hot tub",
  internet: "Wi-Fi",
  kitchenavailable: "Kitchen",
  pool: "Pool",
  smokealarm: "Smoke detector",
  smokedetector: "Smoke detector",
  swimmingpool: "Pool",
  television: "TV",
  washer: "Washer",
  washingmachine: "Washer",
  wifi: "Wi-Fi",
  wirelessinternet: "Wi-Fi",
};

function amenityKey(value: string): string {
  return value.normalize("NFKD").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function cleanAmenity(value: string): string | null {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^(amenity|feature):\s*/i, "")
    .trim()
    .slice(0, 80);
  if (cleaned.length < 2 || /^yes|no|true|false$/i.test(cleaned)) return null;
  return AMENITY_ALIASES[amenityKey(cleaned)] ?? cleaned;
}

function amenityCategory(name: string): string {
  const value = name.toLowerCase();
  if (/bath|shower|toilet|hair dryer/.test(value)) return "Bathroom";
  if (/tv|television|game|cinema|speaker/.test(value)) return "Entertainment";
  if (/kitchen|coffee|oven|stove|microwave|fridge|refrigerator|dishwasher/.test(value)) return "Kitchen";
  if (/garden|balcony|terrace|patio|barbecue|bbq|outdoor/.test(value)) return "Outdoor";
  if (/alarm|detector|extinguisher|first aid|safe|security/.test(value)) return "Safety";
  if (/wifi|internet|heating|air conditioning|washer|dryer|iron|linen|towel/.test(value)) return "Essentials";
  return "Features";
}

function matchPropertyType(
  importedType: string | undefined,
  choices: { value: string; label: string }[],
): string {
  if (!importedType) return "";
  const imported = amenityKey(importedType)
    .replace(/vacationrental|lodgingbusiness|accommodation/g, "");
  if (!imported) return "";
  const exact = choices.find(
    (choice) => amenityKey(choice.value) === imported || amenityKey(choice.label) === imported,
  );
  if (exact) return exact.value;
  const fuzzy = choices.find((choice) => {
    const value = amenityKey(choice.value);
    const label = amenityKey(choice.label);
    return imported.includes(value) || imported.includes(label) || value.includes(imported) || label.includes(imported);
  });
  return fuzzy?.value ?? "";
}

function integerString(value: number | undefined, maximum: number): string {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= maximum
    ? String(value)
    : "";
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireHost();
  } catch {
    return NextResponse.json({ error: "Host access required." }, { status: 401 });
  }
  if (!rateLimit(`listing-import:${user.id}`, 8, 10 * 60_000).success) {
    return NextResponse.json(
      { error: "Too many imports. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Enter a supported listing URL and confirm that you can reuse its content." },
      { status: 400 },
    );
  }

  let imported;
  try {
    imported = await importListingUrl(input.url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The listing could not be imported." },
      { status: 422 },
    );
  }

  const mediaItems = await copyImportedImages(imported.imageUrls);
  const storage = getStorageAdapter();
  try {
    const [existingAmenities, propertyTypes] = await Promise.all([
      db.amenity.findMany(),
      db.propertyType.findMany({
        where: { isActive: true },
        select: { value: true, label: true },
      }),
    ]);
    const existingByKey = new Map(existingAmenities.map((amenity) => [amenityKey(amenity.name), amenity]));
    const names = [...new Set(imported.amenities.map(cleanAmenity).filter((name): name is string => Boolean(name)))];

    const result = await db.$transaction(async (transaction) => {
      const amenityIds: string[] = [];
      let createdAmenities = 0;
      for (const name of names) {
        const aliasName = AMENITY_ALIASES[amenityKey(name)] ?? name;
        const existing = existingByKey.get(amenityKey(aliasName));
        if (existing) {
          amenityIds.push(existing.id);
          if (!existing.isActive) {
            await transaction.amenity.update({ where: { id: existing.id }, data: { isActive: true } });
          }
          continue;
        }
        const created = await transaction.amenity.upsert({
          where: { name: aliasName },
          update: { isActive: true },
          create: { name: aliasName, category: amenityCategory(aliasName), isActive: true },
        });
        amenityIds.push(created.id);
        existingByKey.set(amenityKey(aliasName), created);
        createdAmenities += 1;
      }

      const hasCoordinates = imported.latitude !== undefined && imported.longitude !== undefined;
      const currency = imported.currency && isSupportedCurrency(imported.currency)
        ? imported.currency
        : "EUR";
      const data = {
        currentStep: 0,
        currentStepId: "propertyType",
        title: imported.title?.slice(0, 100) ?? "",
        description: imported.description?.slice(0, 5_000) ?? "",
        propertyType: matchPropertyType(imported.propertyType, propertyTypes),
        address: imported.address ?? "",
        city: imported.city ?? "",
        area: imported.area ?? "",
        postalCode: imported.postalCode?.slice(0, 20) ?? "",
        country: imported.country ?? "",
        latitude: hasCoordinates ? String(imported.latitude) : "",
        longitude: hasCoordinates ? String(imported.longitude) : "",
        locationSource: hasCoordinates ? "import" : "",
        // Imported coordinates still need the host's explicit confirmation on the map.
        locationConfirmed: "",
        maxGuests: integerString(imported.maxGuests, 20) || "1",
        bedrooms: integerString(imported.bedrooms, 20) || "0",
        beds: integerString(imported.beds, 40) || "0",
        bathrooms: integerString(imported.bathrooms, 20) || "0",
        currency,
        baseNightlyRate: imported.nightlyRate && imported.nightlyRate > 0
          ? String(imported.nightlyRate)
          : "",
        cleaningFee: "0",
        minNights: "1",
        mediaItems,
        amenityIds,
        importProvider: imported.provider,
        importSourceUrl: imported.sourceUrl,
        importedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue;
      const draft = await transaction.listingDraft.create({
        data: { hostId: user.id, data },
      });
      return { draft, createdAmenities };
    });

    if (result.createdAmenities > 0) revalidateTag(AMENITIES_TAG, "max");
    return NextResponse.json({
      draftId: result.draft.id,
      imported: {
        photos: mediaItems.length,
        amenities: names.length,
        createdAmenities: result.createdAmenities,
      },
    });
  } catch (error) {
    await Promise.all(mediaItems.map((item) => storage.delete(item.url)));
    console.error("Unable to create imported listing draft", error);
    return NextResponse.json(
      { error: "The details were read, but the draft could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
