import { requireHostPage } from "@/lib/auth-helpers";
import { getHostListingDrafts } from "@/lib/services/listing.service";
import { getHostListingsOverview } from "@/lib/services/host-listing-overview.service";
import { ListingOverview } from "@/components/host/v2/listings/listing-overview";
import {
  isEmptyListingDraft,
  type ListingDraftData,
} from "@/lib/types/listing-draft";
import { LISTING_STEPS, resumeListingStep } from "@/lib/constants/listing-steps";
import { LISTING_STATUSES } from "@/lib/constants";
import { resolveListingStatus } from "@/lib/i18n/status-labels";
import { getT } from "@/lib/i18n/t";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";

export const metadata = { title: "Your listings" };

export default async function HostV2ListingsPage() {
  const user = await requireHostPage();
  const [listings, allDrafts, t] = await Promise.all([
    getHostListingsOverview(user.id),
    getHostListingDrafts(user.id),
    getT(),
  ]);

  const untitled = t.resolve("host.listings.untitled_draft", "Untitled draft").text;

  // Empty drafts (wizard opened, nothing filled in) are noise rather than work in
  // progress — newer saves never create them and older rows are hidden, not migrated.
  const drafts = allDrafts
    .filter((draft) => !isEmptyListingDraft(draft.data as ListingDraftData))
    .map((draft) => {
      const data = draft.data as ListingDraftData;
      const step = resumeListingStep(data.currentStepId, data.currentStep);
      return {
        id: draft.id,
        title: data.title?.trim() || untitled,
        step: step + 1,
        totalSteps: LISTING_STEPS.length,
        stepTitle: LISTING_STEPS[step].title,
      };
    });

  const statusLabels = Object.fromEntries(
    LISTING_STATUSES.map((status) => [
      status.value,
      resolveListingStatus(t, status.value).text,
    ])
  );

  return (
    <ListingOverview
      listings={listings}
      drafts={drafts}
      statusLabels={statusLabels}
      dateFormats={buildCalendarFormats(t.locale, [])}
    />
  );
}
