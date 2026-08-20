import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingPricingSummary } from "@/lib/services/listing-pricing.service";
import { getT } from "@/lib/i18n/t";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { PricingOverview } from "@/components/host/v2/editor/pricing-overview";

/**
 * Read-only by design: Calendar is the only place a price changes, and this section
 * exists so a host can see what the listing charges without going looking for it. It
 * is not counted toward listing completion — there is nothing here to complete.
 */
export default async function PricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  const [listing, summary] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingPricingSummary(id, user.id),
  ]);
  if (!listing || !summary) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="pricing"
      complete={listing.completeSections}
    >
      <PricingOverview summary={summary} t={t} />
    </EditorFrame>
  );
}
