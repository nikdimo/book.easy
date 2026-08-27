import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingBasicsEditorData } from "@/lib/services/listing-basics.service";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { BasicsWorkspace } from "@/components/host/v2/editor/basics/basics-workspace";

export const metadata = { title: "Title & description" };

export default async function BasicsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();
  // Both reads are scoped to this host, so a listing they do not own is `notFound`
  // rather than an empty editor.
  const [header, basics] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingBasicsEditorData(id, user.id),
  ]);
  if (!header || !basics) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="basics"
      attention={header.attention} previewSlug={header.slug} previewStatus={header.status}
    >
      <BasicsWorkspace
        listingId={id}
        title={basics.title}
        description={basics.description}
      />
    </EditorFrame>
  );
}
