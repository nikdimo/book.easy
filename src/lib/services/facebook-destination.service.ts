import "server-only";
import { db } from "@/lib/db";
import { normalizeFacebookGroupUrl } from "@/lib/facebook-destinations";

/**
 * A host's saved Facebook groups.
 *
 * Every function here takes `hostId` as its first argument and puts it in the `where`
 * clause — including the ones that already have a row id. An id is a thing a client
 * can guess or replay, so "update the row with this id" is never enough on its own;
 * "update the row with this id *that belongs to this host*" is. That is why the
 * mutations use `updateMany`/`deleteMany` with a compound filter rather than the
 * `update`/`delete` an id alone would allow.
 */

export const DESTINATION_NAME_MAX = 60;
/** A working list, not a directory. Past this the workspace is a filing cabinet, and
 *  the limit also caps what one account can write. */
export const DESTINATION_LIMIT = 50;

export interface HostFacebookDestinationView {
  id: string;
  name: string;
  url: string;
  favorite: boolean;
  lastUsedAt: string | null;
}

export type DestinationError =
  | "INVALID_URL"
  | "DUPLICATE"
  | "NOT_FOUND"
  | "NAME_REQUIRED"
  | "LIMIT_REACHED";

type Result<T> = { ok: true; data: T } | { ok: false; error: DestinationError };

function toView(row: {
  id: string;
  name: string;
  url: string;
  favorite: boolean;
  lastUsedAt: Date | null;
}): HostFacebookDestinationView {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    favorite: row.favorite,
    // Serialized rather than passed as a `Date`: this crosses the server action
    // boundary into a client component, and the client only ever sorts and formats it.
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, DESTINATION_NAME_MAX);
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Favourites first, then whichever group the host most recently opened, then the
 * newest. A host who never marks a favourite still gets their working groups on top
 * simply by using them.
 *
 * Ordered in SQL rather than in the component so every caller — and the mobile app, if
 * it grows this screen — sees the same order without re-deriving it.
 */
export async function listHostFacebookDestinations(
  hostId: string,
): Promise<HostFacebookDestinationView[]> {
  const rows = await db.hostFacebookDestination.findMany({
    where: { hostId },
    orderBy: [
      { favorite: "desc" },
      { lastUsedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      name: true,
      url: true,
      favorite: true,
      lastUsedAt: true,
    },
  });
  return rows.map(toView);
}

export async function createHostFacebookDestination(
  hostId: string,
  input: { name: string; url: string; favorite?: boolean },
): Promise<Result<HostFacebookDestinationView>> {
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: "NAME_REQUIRED" };

  const normalized = normalizeFacebookGroupUrl(input.url);
  if (!normalized.ok) return { ok: false, error: "INVALID_URL" };

  const existing = await db.hostFacebookDestination.count({ where: { hostId } });
  if (existing >= DESTINATION_LIMIT) return { ok: false, error: "LIMIT_REACHED" };

  // The `@@unique([hostId, url])` index is the real guard — two tabs can both pass a
  // pre-check — so a duplicate is detected by letting the insert fail rather than by
  // trusting a read that happened a moment earlier.
  const duplicate = await db.hostFacebookDestination.findUnique({
    where: { hostId_url: { hostId, url: normalized.url } },
    select: { id: true },
  });
  if (duplicate) return { ok: false, error: "DUPLICATE" };

  try {
    const row = await db.hostFacebookDestination.create({
      data: {
        hostId,
        name,
        url: normalized.url,
        favorite: input.favorite ?? false,
      },
      select: {
        id: true,
        name: true,
        url: true,
        favorite: true,
        lastUsedAt: true,
      },
    });
    return { ok: true, data: toView(row) };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, error: "DUPLICATE" };
    }
    throw error;
  }
}

/**
 * Renames a destination, and optionally re-points or (un)favourites it.
 *
 * Scoped by `hostId` in the filter, so passing another host's id updates nothing and
 * reports NOT_FOUND — the same answer a genuinely missing row gets, which is also the
 * answer that leaks the least about whether the row exists at all.
 */
export async function updateHostFacebookDestination(
  hostId: string,
  id: string,
  input: { name?: string; url?: string; favorite?: boolean },
): Promise<Result<HostFacebookDestinationView>> {
  const data: { name?: string; url?: string; favorite?: boolean } = {};

  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) return { ok: false, error: "NAME_REQUIRED" };
    data.name = name;
  }

  if (input.url !== undefined) {
    const normalized = normalizeFacebookGroupUrl(input.url);
    if (!normalized.ok) return { ok: false, error: "INVALID_URL" };
    const clash = await db.hostFacebookDestination.findUnique({
      where: { hostId_url: { hostId, url: normalized.url } },
      select: { id: true },
    });
    if (clash && clash.id !== id) return { ok: false, error: "DUPLICATE" };
    data.url = normalized.url;
  }

  if (input.favorite !== undefined) data.favorite = input.favorite;

  let updated: { count: number };
  try {
    updated = await db.hostFacebookDestination.updateMany({
      where: { id, hostId },
      data,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, error: "DUPLICATE" };
    }
    throw error;
  }
  if (updated.count === 0) return { ok: false, error: "NOT_FOUND" };

  const row = await db.hostFacebookDestination.findFirst({
    where: { id, hostId },
    select: {
      id: true,
      name: true,
      url: true,
      favorite: true,
      lastUsedAt: true,
    },
  });
  if (!row) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, data: toView(row) };
}

export async function deleteHostFacebookDestination(
  hostId: string,
  id: string,
): Promise<Result<{ id: string }>> {
  const deleted = await db.hostFacebookDestination.deleteMany({
    where: { id, hostId },
  });
  if (deleted.count === 0) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, data: { id } };
}

/**
 * Records that the host just opened this group, which is what "recently used first"
 * sorts on.
 *
 * Deliberately not a claim that anything was posted. Linger Homes cannot know that,
 * and the wording everywhere around this call is careful not to imply it.
 */
export async function touchHostFacebookDestination(
  hostId: string,
  id: string,
  now = new Date(),
): Promise<Result<{ id: string }>> {
  const updated = await db.hostFacebookDestination.updateMany({
    where: { id, hostId },
    data: { lastUsedAt: now },
  });
  if (updated.count === 0) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, data: { id } };
}
