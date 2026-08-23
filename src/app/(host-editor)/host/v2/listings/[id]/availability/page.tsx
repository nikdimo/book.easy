import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingAvailabilityOverview } from "@/lib/services/listing-availability-overview.service";
import { getT } from "@/lib/i18n/t";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { AvailabilitySummary } from "@/components/host/v2/editor/availability-summary";

/**
 * Availability, as a read-only report.
 *
 * Both reads are scoped to this host, so a listing that is not theirs is `notFound()`
 * rather than a page that tells them it exists. Nothing on this route mutates anything:
 * every change to availability is made in Calendar, which is the one place that owns it.
 *
 * `complete` deliberately never mentions this section — it is not a listing task, and
 * `editorCompletionCount` would ignore it even if it were passed.
 */
export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  const [listing, overview] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingAvailabilityOverview(id, user.id),
  ]);
  if (!listing || !overview) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="availability"
      complete={listing.completeSections}
      previewSlug={listing.slug}
      previewStatus={listing.status}
    >
      <AvailabilitySummary overview={overview} t={t} />
    </EditorFrame>
  );
}
