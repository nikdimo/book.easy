"use server";

import { auth } from "@/lib/auth";
import {
  createHostFacebookDestination,
  deleteHostFacebookDestination,
  listHostFacebookDestinations,
  touchHostFacebookDestination,
  updateHostFacebookDestination,
  type DestinationError,
  type HostFacebookDestinationView,
} from "@/lib/services/facebook-destination.service";
import {
  checkPromotionRange,
  getPromotionListing,
  type PromotionListingView,
  type PromotionRangeCheck,
} from "@/lib/services/listing-promotion.service";

/**
 * The promotion workspace's server boundary.
 *
 * Every action re-reads the signed-in host from the session and passes that id — never
 * one from the request — into the service layer. A server action is a public POST
 * endpoint; the fact that the workspace only renders for a host who owns the listing
 * is a UI courtesy, not the authorization.
 *
 * Saved destinations are not revalidated through `revalidatePath`: they live entirely
 * inside a client dialog that already holds the list in state, and the pages that
 * render the promote button do not display them.
 */

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Service error codes reach the client verbatim so the dialog can pick its own
 *  translated sentence for each. They are stable identifiers, not copy. */
function failure(error: DestinationError | "UNAUTHORIZED"): {
  ok: false;
  error: string;
} {
  return { ok: false, error };
}

async function requireHostId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function listFacebookDestinationsAction(): Promise<
  ActionResult<HostFacebookDestinationView[]>
> {
  const hostId = await requireHostId();
  if (!hostId) return failure("UNAUTHORIZED");
  return { ok: true, data: await listHostFacebookDestinations(hostId) };
}

export async function createFacebookDestinationAction(
  input: unknown,
): Promise<ActionResult<HostFacebookDestinationView>> {
  const hostId = await requireHostId();
  if (!hostId) return failure("UNAUTHORIZED");

  const value =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};

  const result = await createHostFacebookDestination(hostId, {
    name: String(value.name ?? ""),
    url: String(value.url ?? ""),
  });
  return result.ok ? { ok: true, data: result.data } : failure(result.error);
}

export async function updateFacebookDestinationAction(
  id: string,
  input: unknown,
): Promise<ActionResult<HostFacebookDestinationView>> {
  const hostId = await requireHostId();
  if (!hostId) return failure("UNAUTHORIZED");

  const value =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};

  const result = await updateHostFacebookDestination(hostId, String(id), {
    name: value.name === undefined ? undefined : String(value.name),
    url: value.url === undefined ? undefined : String(value.url),
    favorite: typeof value.favorite === "boolean" ? value.favorite : undefined,
  });
  return result.ok ? { ok: true, data: result.data } : failure(result.error);
}

export async function deleteFacebookDestinationAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const hostId = await requireHostId();
  if (!hostId) return failure("UNAUTHORIZED");

  const result = await deleteHostFacebookDestination(hostId, String(id));
  return result.ok ? { ok: true, data: result.data } : failure(result.error);
}

/** Records that the host opened this group. Not a claim that they posted in it. */
export async function markFacebookDestinationUsedAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const hostId = await requireHostId();
  if (!hostId) return failure("UNAUTHORIZED");

  const result = await touchHostFacebookDestination(hostId, String(id));
  return result.ok ? { ok: true, data: result.data } : failure(result.error);
}

/**
 * Everything the workspace shows about one listing, loaded when the dialog opens
 * rather than with the listings page. A description and an availability calendar per
 * card would be a large payload for a screen most visits never promote from.
 */
export async function getPromotionWorkspaceAction(
  listingId: string,
): Promise<ActionResult<PromotionListingView>> {
  const hostId = await requireHostId();
  if (!hostId) return failure("UNAUTHORIZED");

  const listing = await getPromotionListing(hostId, String(listingId));
  if (!listing) return { ok: false, error: "LISTING_NOT_PROMOTABLE" };
  return { ok: true, data: listing };
}

/** Re-checks a picked range against live availability. Called again immediately
 *  before the post is generated or copied — see `checkPromotionRange`. */
export async function checkPromotionRangeAction(
  listingId: string,
  checkIn: string,
  checkOut: string,
): Promise<ActionResult<PromotionRangeCheck>> {
  const hostId = await requireHostId();
  if (!hostId) return failure("UNAUTHORIZED");

  return {
    ok: true,
    data: await checkPromotionRange(
      hostId,
      String(listingId),
      String(checkIn),
      String(checkOut),
    ),
  };
}
