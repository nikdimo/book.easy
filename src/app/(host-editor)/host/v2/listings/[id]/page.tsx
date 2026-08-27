import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorOverview } from "@/lib/services/listing-editor.service";
import { EDITOR_OVERVIEW_SLUG } from "@/lib/host/v2/editor-sections";
import { getT } from "@/lib/i18n/t";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { EditorOverview } from "@/components/host/v2/editor/overview/editor-overview";

export const metadata = { title: "Listing overview" };

/**
 * Opening a listing means opening its overview.
 *
 * It used to redirect to Photos, which chose the host's next task for them before they
 * had said what they came to do. The base route renders the index instead: what state
 * the listing is in, what genuinely needs attention, and every section one click away.
 * Direct links to a section still go straight there — this is a default, not a step.
 *
 * The read is scoped to the signed-in host inside its query, so a listing that is not
 * theirs is `notFound()` rather than a page that confirms it exists.
 */
export default async function ListingEditorOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  const overview = await getListingEditorOverview(id, user.id);
  if (!overview) notFound();

  return (
    <EditorFrame
      listingId={id}
      section={EDITOR_OVERVIEW_SLUG}
      attention={overview.attention}
      previewSlug={overview.slug}
      previewStatus={overview.status}
      // "All sections" below is the same list the footer would repeat, with real
      // summaries attached. One of them on a page is enough.
      sectionFooter={false}
    >
      <EditorOverview overview={overview} t={t} />
    </EditorFrame>
  );
}
