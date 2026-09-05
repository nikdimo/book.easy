import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import {
  getListingEditorData,
  getListingEditorHeader,
} from "@/lib/services/listing-editor.service";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { PhotosWorkspace } from "@/components/host/v2/editor/photos/photos-workspace";

export const metadata = { title: "Photos" };

export default async function ListingPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();
  // Two reads because they answer different questions: the workspace needs the photos and
  // their rooms, the left column needs a summary line per section. Nothing else on this
  // page wants the second one, so it is fetched beside the first rather than folded in.
  const [data, header] = await Promise.all([
    getListingEditorData(id, user.id),
    getListingEditorHeader(id, user.id),
  ]);
  if (!data) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="photos"
      attention={data.listing.attention}
      overview={header}
      previewSlug={data.listing.slug}
      previewStatus={data.listing.status}
    >
      <PhotosWorkspace
        listingId={id}
        photos={data.photos}
        rooms={data.rooms}
        roomTypes={data.roomTypes}
      />
    </EditorFrame>
  );
}
