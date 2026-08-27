import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingLocationEditorData } from "@/lib/services/listing-location.service";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { LocationWorkspace } from "@/components/host/v2/editor/location/location-workspace";

export const metadata = { title: "Location" };

/**
 * The Location section.
 *
 * This file existing is what takes the `location` slug away from the `[section]`
 * placeholder route — a static segment wins over a dynamic sibling — so the section
 * list itself needs no change to switch a host over to the real screen.
 */
export default async function LocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();
  // Both reads are scoped to this host inside the query, so a listing they do not own
  // is `notFound` rather than an editor holding somebody else's street address.
  const [header, location] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingLocationEditorData(id, user.id),
  ]);
  if (!header || !location) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="location"
      attention={header.attention} previewSlug={header.slug} previewStatus={header.status}
    >
      <LocationWorkspace listingId={id} stored={location.stored} />
    </EditorFrame>
  );
}
