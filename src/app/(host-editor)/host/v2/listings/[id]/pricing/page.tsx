import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingPricingSummary } from "@/lib/services/listing-pricing.service";
import { getHostCalendarListingContext } from "@/lib/services/host-calendar-workspace.service";
import { getT } from "@/lib/i18n/t";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { PricingOverview } from "@/components/host/v2/editor/pricing-overview";
import { PricingDefaultsEditor } from "@/components/host/v2/editor/pricing-defaults-editor";
import { OngoingOffersEditor } from "@/components/host/v2/editor/ongoing-offers-editor";

/**
 * Pricing: the editable home for what this listing charges by default.
 *
 * The base price, the cleaning fee and the offers that run on every date are set here.
 * Stay limits belong to Availability → Booking rules. Prices for particular nights
 * and offers with a start and an end belong to the calendar, and are reported here with
 * links that name the job.
 *
 * Every read is scoped to this host inside its own query, so a listing that is not
 * theirs is `notFound()` rather than a page that tells them it exists. The writes go
 * through the same server actions the calendar used to call, which re-check ownership,
 * validate, audit and revalidate on their own.
 *
 * Two reads because they answer different questions: the summary is the narrow "what
 * does this listing charge" report, and the calendar context is the date prices,
 * offers and reservations the review model needs to say what a change would do.
 *
 * Pricing stays in "Needs your attention" when the listing has no pricing rule at all —
 * that is a blocked sale, not an unfinished form, and `editorAttentionItems` decides it
 * from `hasPricing`. Nothing about this page having inputs changes that.
 */
export default async function PricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  const [listing, summary, context] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingPricingSummary(id, user.id),
    // The catalog locale, so money and dates in the editors and the confirmation match
    // the words around them rather than whatever locale data the browser happens to
    // ship — the same reason the calendar resolves its formats on the server.
    getHostCalendarListingContext(id, user.id, t.locale),
  ]);
  if (!listing || !summary || !context) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="pricing"
      attention={listing.attention}
      previewSlug={listing.slug}
      previewStatus={listing.status}
    >
      <PricingOverview
        summary={summary}
        defaultsEditor={<PricingDefaultsEditor context={context} />}
        offersEditor={<OngoingOffersEditor context={context} />}
        t={t}
      />
    </EditorFrame>
  );
}
