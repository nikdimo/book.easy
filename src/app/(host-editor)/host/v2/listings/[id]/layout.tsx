import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import {
  getListingEditorHeader,
  getSwitchableListings,
} from "@/lib/services/listing-editor.service";
import { LISTING_STATUSES } from "@/lib/constants";
import { resolveListingStatus } from "@/lib/i18n/status-labels";
import { getT } from "@/lib/i18n/t";
import { EditorHeader } from "@/components/host/v2/editor/editor-header";

/**
 * The listing editor's own frame.
 *
 * It sits in its own route group so it does not inherit `(host-v2)`'s app header. The
 * editor is a focus mode: one header, and the app chrome one click behind the back
 * arrow. Nesting it under the app shell would stack two headers, and the second one
 * would push the actual work below the fold on a laptop.
 */
export default async function ListingEditorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  const [listing, listings] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getSwitchableListings(user.id),
  ]);
  if (!listing) notFound();

  const statusLabels = Object.fromEntries(
    LISTING_STATUSES.map((status) => [
      status.value,
      resolveListingStatus(t, status.value).text,
    ]),
  );

  return (
    // A fixed frame from `lg` up: the header is the only thing above the work area, and
    // the workspace inside decides for itself what scrolls. Below `lg` it stays an
    // ordinary scrolling document, which is what a phone and a portrait tablet want.
    // `overflow-x-hidden` is a floor, not the fix — nothing in here should overflow
    // sideways, and this only stops one stray element from putting a scrollbar under the
    // whole page while it is being found.
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-white text-slate-950 lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <EditorHeader
        listingId={listing.id}
        title={listing.title}
        status={listing.status}
        statusLabel={resolveListingStatus(t, listing.status).text}
        statusLabels={statusLabels}
        slug={listing.slug}
        coverUrl={listing.coverUrl}
        listings={listings}
      />
      {children}
    </div>
  );
}
