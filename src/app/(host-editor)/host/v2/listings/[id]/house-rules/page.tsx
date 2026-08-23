import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingHouseRulesEditorData } from "@/lib/services/listing-house-rules.service";
import { getT } from "@/lib/i18n/t";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { HouseRulesWorkspace } from "@/components/host/v2/editor/house-rules/house-rules-workspace";
import { HouseRulesElsewhere } from "@/components/host/v2/editor/house-rules/house-rules-elsewhere";

export const metadata = { title: "House rules" };

/**
 * House rules.
 *
 * On completion: this tab reports complete once `houseRulesReviewedAt` is set, and not
 * before. Every field it edits has a value the moment a listing exists — `maxGuests` is
 * required to publish, and a null stay time is a real choice ("I am flexible") rather
 * than an unanswered question — so "has values" cannot distinguish a host who reviewed
 * this page from one who never opened it. A recorded visit can, which is what that
 * column is for and what the tick is a claim about.
 */
export default async function ListingHouseRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();
  // Both reads are scoped to this host, so a listing they do not own is `notFound`
  // rather than an empty editor.
  const [header, rules, t] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingHouseRulesEditorData(id, user.id),
    getT(),
  ]);
  if (!header || !rules) notFound();

  return (
    <EditorFrame listingId={id} section="house-rules" complete={header.completeSections} previewSlug={header.slug} previewStatus={header.status}>
      <div className="mx-auto w-full max-w-2xl py-6 pb-12 md:py-10 md:pb-14">
        <HouseRulesWorkspace
          listingId={id}
          rules={rules.rules}
          largestUpcomingParty={rules.largestUpcomingParty}
        />
        <HouseRulesElsewhere listingId={id} t={t} />
      </div>
    </EditorFrame>
  );
}
