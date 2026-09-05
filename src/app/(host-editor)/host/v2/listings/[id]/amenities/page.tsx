import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingAmenitiesEditorData } from "@/lib/services/listing-amenities.service";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { AmenitiesWorkspace } from "@/components/host/v2/editor/amenities/amenities-workspace";

export const metadata = { title: "Amenities" };

/**
 * Amenities.
 *
 * On completion: this tab is deliberately *not* reported complete. Amenities are
 * optional, so "has at least one" says nothing about whether the host has looked at the
 * list — a listing imported from Airbnb arrives with a dozen and has never been reviewed
 * — and there is nowhere to persist the fact that they have. `ListingAmenity` records the
 * choice, not the visit, and nothing on `Listing` carries a "reviewed" timestamp. The
 * honest alternatives are a schema change (a `amenitiesReviewedAt` column, the right fix
 * when someone owns the migration) or client-only state that a different browser or a
 * cleared cookie would silently lose. Until the column exists, the tick stays off rather
 * than claiming something no stored value backs.
 */
export default async function ListingAmenitiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();
  const [data, header] = await Promise.all([
    getListingAmenitiesEditorData(id, user.id),
    getListingEditorHeader(id, user.id),
  ]);
  if (!data || !header) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="amenities"
      attention={header.attention} overview={header} previewSlug={header.slug} previewStatus={header.status}
    >
      <AmenitiesWorkspace
        listingId={id}
        catalog={data.catalog}
        selectedIds={data.selectedIds}
        hiddenSelectedIds={data.hiddenSelectedIds}
      />
    </EditorFrame>
  );
}
