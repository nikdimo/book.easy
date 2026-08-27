import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingPropertyDetailsEditorData } from "@/lib/services/listing-property-details.service";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { PropertyDetailsWorkspace } from "@/components/host/v2/editor/rooms/property-details-workspace";

export const metadata = { title: "Property details" };

export default async function PropertyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireHostPage();
  const [header, details] = await Promise.all([getListingEditorHeader(id, user.id), getListingPropertyDetailsEditorData(id, user.id)]);
  if (!header || !details) notFound();
  return <EditorFrame listingId={id} section="rooms" attention={header.attention} previewSlug={header.slug} previewStatus={header.status}><PropertyDetailsWorkspace listingId={id} stored={details.stored} propertyTypes={details.propertyTypes} rooms={details.rooms} roomTypes={details.roomTypes} /></EditorFrame>;
}
