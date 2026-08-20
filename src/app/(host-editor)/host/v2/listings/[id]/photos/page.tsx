import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorData } from "@/lib/services/listing-editor.service";
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
  const data = await getListingEditorData(id, user.id);
  if (!data) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="photos"
      complete={data.listing.completeSections}
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
