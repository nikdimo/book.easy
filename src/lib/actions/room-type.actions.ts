"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidateTag, revalidatePath } from "next/cache";
import { ROOM_TYPES_TAG } from "@/lib/services/room-type.service";
import { uniqueRoomCategoryKey, uniqueRoomTypeKey } from "@/lib/rooms/catalog";
import { isAmenityIconKey } from "@/lib/amenities/icon-registry";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale-preference";

/** Leaves room to drop a row between two neighbours without renumbering the rest. */
const ORDER_STEP = 10;

function refreshRoomTypeViews() {
  revalidateTag(ROOM_TYPES_TAG, "max");
  revalidatePath("/admin/settings");
}

// ─── Room types ───────────────────────────────────────────────────────────────

export async function addRoomType(
  name: string,
  categoryId: string,
  icon?: string,
  isRepeatable = true,
  isStandard = false,
) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the space." };
  if (icon && !isAmenityIconKey(icon)) return { error: "Choose an icon from the list." };

  const [existing, category] = await Promise.all([
    db.roomType.findUnique({ where: { name: label } }),
    db.roomTypeCategory.findUnique({ where: { id: categoryId } }),
  ]);
  if (existing) return { error: "A space with that name already exists." };
  if (!category) return { error: "Choose a group." };

  const last = await db.roomType.findFirst({
    where: { categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const roomType = await db.roomType.create({
    data: {
      name: label,
      key: await uniqueRoomTypeKey(label),
      categoryId,
      icon: icon ?? null,
      isRepeatable,
      isStandard,
      sortOrder: (last?.sortOrder ?? 0) + ORDER_STEP,
    },
  });

  refreshRoomTypeViews();
  return { success: true, id: roomType.id };
}

export async function updateRoomType(
  id: string,
  name: string,
  icon: string | null,
  isRepeatable: boolean,
  categoryId: string,
  isStandard: boolean,
) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the space." };
  if (icon !== null && !isAmenityIconKey(icon)) {
    return { error: "Choose an icon from the list." };
  }

  const [clash, category] = await Promise.all([
    db.roomType.findFirst({ where: { name: label, id: { not: id } }, select: { id: true } }),
    db.roomTypeCategory.findUnique({ where: { id: categoryId } }),
  ]);
  if (clash) return { error: "Another space already uses that name." };
  if (!category) return { error: "Choose a group." };

  await db.roomType.update({
    where: { id },
    data: { name: label, icon, isRepeatable, categoryId, isStandard },
  });
  refreshRoomTypeViews();
  return { success: true };
}

export async function toggleRoomTypeActive(id: string) {
  await requireAdmin();

  const roomType = await db.roomType.findUnique({ where: { id } });
  if (!roomType) return { error: "Space not found." };

  await db.roomType.update({
    where: { id },
    data: { isActive: !roomType.isActive },
  });

  refreshRoomTypeViews();
  return { success: true, isActive: !roomType.isActive };
}

/**
 * Applies one drag: the moved rows land in `categoryId` and every row in that group is
 * renumbered from the order the editor shows. Sending the whole order rather than one
 * index keeps the result identical to what the admin just saw, even if two tabs are open.
 */
export async function reorderRoomTypes(categoryId: string, orderedIds: string[]) {
  await requireAdmin();
  if (orderedIds.length === 0) return { error: "Nothing to reorder." };

  const category = await db.roomTypeCategory.findUnique({ where: { id: categoryId } });
  if (!category) return { error: "Group not found." };

  const known = await db.roomType.findMany({
    where: { id: { in: orderedIds } },
    select: { id: true },
  });
  if (known.length !== orderedIds.length) return { error: "Some spaces no longer exist." };

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.roomType.update({
        where: { id },
        data: { categoryId, sortOrder: (index + 1) * ORDER_STEP },
      }),
    ),
  );

  refreshRoomTypeViews();
  return { success: true };
}

/**
 * Hard delete, allowed only for a type no listing has a room of. Anything in use has to
 * be hidden instead: deleting it would take live rooms — and the photo grouping that
 * hangs off them — down with it, which is not something an admin can see happening from
 * this screen.
 */
export async function deleteRoomType(id: string) {
  await requireAdmin();

  const roomType = await db.roomType.findUnique({
    where: { id },
    include: { _count: { select: { rooms: true } } },
  });
  if (!roomType) return { error: "Space not found." };
  if (roomType._count.rooms > 0) {
    return {
      error: `${roomType.name} is used by ${roomType._count.rooms} listing room(s). Hide it instead.`,
    };
  }

  await db.roomType.delete({ where: { id } });
  refreshRoomTypeViews();
  return { success: true, name: roomType.name };
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export async function addRoomTypeCategory(name: string, icon?: string) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the group." };
  if (icon && !isAmenityIconKey(icon)) return { error: "Choose an icon from the list." };

  const existing = await db.roomTypeCategory.findUnique({ where: { name: label } });
  if (existing) return { error: "A group with that name already exists." };

  const last = await db.roomTypeCategory.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const category = await db.roomTypeCategory.create({
    data: {
      name: label,
      key: await uniqueRoomCategoryKey(label),
      icon: icon ?? null,
      sortOrder: (last?.sortOrder ?? 0) + ORDER_STEP,
    },
  });

  refreshRoomTypeViews();
  return { success: true, id: category.id };
}

export async function renameRoomTypeCategory(id: string, name: string, icon: string | null) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the group." };
  if (icon !== null && !isAmenityIconKey(icon)) {
    return { error: "Choose an icon from the list." };
  }

  const clash = await db.roomTypeCategory.findFirst({
    where: { name: label, id: { not: id } },
    select: { id: true },
  });
  if (clash) return { error: "Another group already uses that name." };

  await db.roomTypeCategory.update({ where: { id }, data: { name: label, icon } });
  refreshRoomTypeViews();
  return { success: true };
}

export async function toggleRoomTypeCategoryActive(id: string) {
  await requireAdmin();
  const category = await db.roomTypeCategory.findUnique({ where: { id } });
  if (!category) return { error: "Group not found." };
  await db.roomTypeCategory.update({
    where: { id },
    data: { isActive: !category.isActive },
  });
  refreshRoomTypeViews();
  return { success: true };
}

/** Only an empty group can go: the alternative would be orphaning its spaces or
 *  silently moving them somewhere the admin did not choose. */
export async function deleteRoomTypeCategory(id: string) {
  await requireAdmin();
  const category = await db.roomTypeCategory.findUnique({
    where: { id },
    include: { _count: { select: { roomTypes: true } } },
  });
  if (!category) return { error: "Group not found." };
  if (category._count.roomTypes > 0) {
    return {
      error: `${category.name} still holds ${category._count.roomTypes} space${category._count.roomTypes === 1 ? "" : "s"}. Move them out first.`,
    };
  }
  await db.roomTypeCategory.delete({ where: { id } });
  refreshRoomTypeViews();
  return { success: true, name: category.name };
}

// ─── Translations ─────────────────────────────────────────────────────────────

async function assertLanguage(locale: string) {
  if (locale === DEFAULT_LOCALE) return { error: "English comes from the name itself." };
  const language = await db.language.findUnique({ where: { code: locale } });
  if (!language) return { error: "Unknown language." };
  return null;
}

export async function setRoomTypeTranslation(
  roomTypeId: string,
  locale: string,
  label: string,
) {
  await requireAdmin();
  const invalid = await assertLanguage(locale);
  if (invalid) return invalid;

  const value = label.trim();
  if (!value) {
    await db.roomTypeTranslation.deleteMany({ where: { roomTypeId, locale } });
    refreshRoomTypeViews();
    return { success: true, cleared: true };
  }

  await db.roomTypeTranslation.upsert({
    where: { roomTypeId_locale: { roomTypeId, locale } },
    update: { label: value, isManuallyEdited: true },
    create: { roomTypeId, locale, label: value, isManuallyEdited: true },
  });
  refreshRoomTypeViews();
  return { success: true };
}
