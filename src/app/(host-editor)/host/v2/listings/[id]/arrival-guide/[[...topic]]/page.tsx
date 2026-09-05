import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingArrivalGuideEditorData } from "@/lib/services/listing-arrival-guide.service";
import { findArrivalGuideTopic } from "@/lib/host/v2/listing-arrival-guide";
import { EditorHalves } from "@/components/host/v2/editor/editor-halves";
import { ArrivalGuideSection } from "@/components/host/v2/editor/arrival-guide/arrival-guide-section";

export const metadata = { title: "Arrival guide" };

/**
 * The Arrival guide, and each of its nine cards.
 *
 * One optional catch-all rather than a route per card: the cards share a single piece of
 * client state and a single save, so they are one page that knows which card it is showing
 * — not nine pages that would each remount the section and drop whatever the host had
 * half-typed on the last one. The segment still exists so every card has a real URL that
 * can be refreshed, bookmarked and shared.
 *
 * This route deliberately does not render `EditorFrame`: its left column *is* this half's
 * navigation, the way Airbnb's is. It shares `EditorHalves` with the other half, which is
 * what puts the same toggle above both — the switch has to exist on both sides or it is not
 * a switch.
 */
export default async function ArrivalGuidePage({
  params,
}: {
  params: Promise<{ id: string; topic?: string[] }>;
}) {
  const { id, topic } = await params;

  // A card this build does not have is a 404 rather than a silent fall back to the first
  // one: a link to `/arrival-guide/guidebook` should say it is wrong, not quietly show the
  // host something else and let them believe they are looking at what they asked for.
  const slug = topic?.[0] ?? null;
  if (topic && topic.length > 1) notFound();
  if (slug !== null && !findArrivalGuideTopic(slug)) notFound();

  const user = await requireHostPage();
  // Both reads are scoped to this host, so a listing they do not own is `notFound` rather
  // than an empty editor.
  const [header, arrival] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingArrivalGuideEditorData(id, user.id),
  ]);
  if (!header || !arrival) notFound();

  return (
    <EditorHalves listingId={id} half="arrival">
      <ArrivalGuideSection
        listingId={id}
        slug={header.slug}
        status={header.status}
        topic={slug}
        guide={arrival.guide}
        rules={arrival.rules}
        largestUpcomingParty={arrival.largestUpcomingParty}
      />
    </EditorHalves>
  );
}
