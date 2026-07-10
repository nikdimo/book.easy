import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_HEADER_DATA_TAG } from "@/lib/services/search.service";

/** Call whenever a listing's public visibility changes (goes live or comes down) —
 * refreshes the ISR-cached homepage/search entry points and header location data
 * instead of waiting out their revalidation windows (see src/app/layout.tsx). */
export function revalidatePublicListingCaches(): void {
  revalidatePath("/");
  revalidatePath("/properties");
  // Next 16's revalidateTag requires a profile — "max" gives stale-while-revalidate
  // semantics (serves the last known value while refetching in the background on the
  // next visit) rather than blocking the next request on a synchronous refetch.
  revalidateTag(PUBLIC_HEADER_DATA_TAG, "max");
}
