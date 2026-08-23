import { ListingStartDashboard } from "@/components/host/v2/listings/listing-start-dashboard";
import { NewListingWelcome } from "@/components/host/v2/listings/new-listing-welcome";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { getHostListingDrafts } from "@/lib/services/listing.service";
import { listingDraftData } from "@/lib/mobile-listing-draft";

export const metadata = { title: "Welcome to Linger Homes" };

/**
 * Its own route group, deliberately: every page under `/host` inherits the panel
 * shell from that segment's layout, and this screen is the one place in the flow that
 * has to be the whole viewport. Sitting outside `/host` is what buys it that.
 */
export default async function NewListingWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ firstTime?: string | string[] }>;
}) {
  const [user, t, params] = await Promise.all([
    requireHostPage(),
    getT(),
    searchParams,
  ]);
  const firstTime = Array.isArray(params.firstTime)
    ? params.firstTime[0]
    : params.firstTime;

  if (firstTime === "1") return <NewListingWelcome t={t} />;

  const latestDraft = (await getHostListingDrafts(user.id))[0];
  const draftData = latestDraft ? listingDraftData(latestDraft.data) : null;

  return (
    <ListingStartDashboard
      t={t}
      firstName={user.name?.split(" ")[0] || "Host"}
      draft={latestDraft ? { id: latestDraft.id, title: draftData?.title || "Untitled listing" } : null}
    />
  );
}
