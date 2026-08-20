import { NewListingWelcome } from "@/components/host/v2/listings/new-listing-welcome";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";

export const metadata = { title: "Welcome to Linger Homes" };

/**
 * Its own route group, deliberately: every page under `/host/v2` inherits the panel
 * shell from that segment's layout, and this screen is the one place in the flow that
 * has to be the whole viewport. Sitting outside `/host/v2` is what buys it that.
 */
export default async function NewListingWelcomePage() {
  const [, t] = await Promise.all([requireHostPage(), getT()]);
  return <NewListingWelcome t={t} />;
}
