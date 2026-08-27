import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingArrivalGuideEditorData } from "@/lib/services/listing-arrival-guide.service";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { ArrivalGuideWorkspace } from "@/components/host/v2/editor/arrival-guide/arrival-guide-workspace";

export const metadata = { title: "Arrival guide" };

/**
 * Arrival guide. It summarizes stay times but sends edits to House rules, their single
 * owner. Dedicated arrival instructions remain informational until the data contract's
 * storage and visibility decisions are implemented.
 */
export default async function ArrivalGuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();
  // Both reads are scoped to this host, so a listing they do not own is `notFound`
  // rather than an empty editor.
  const [header, arrival] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingArrivalGuideEditorData(id, user.id),
  ]);
  if (!header || !arrival) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="arrival-guide"
      attention={header.attention} previewSlug={header.slug} previewStatus={header.status}
    >
      <ArrivalGuideWorkspace
        listingId={id}
        checkInTime={arrival.checkInTime}
        checkOutTime={arrival.checkOutTime}
      />
    </EditorFrame>
  );
}
