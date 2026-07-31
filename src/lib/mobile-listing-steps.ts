import { LISTING_STEPS } from "@/lib/constants/listing-steps";

/** A listing step as the mobile app sees it. */
export interface MobileListingStep {
  id: string;
  title: string;
  description: string;
}

/** The wizard's steps, served to the mobile app so it never carries its own copy of
 *  the order. An installed app is months behind the server; deriving the list here
 *  means reordering LISTING_STEPS reaches phones on the next launch instead of the
 *  next app store release. Clients render unknown ids generically, so adding a step
 *  is safe for apps that predate it. */
export function mobileListingSteps(): MobileListingStep[] {
  return LISTING_STEPS.map(({ id, title, description }) => ({
    id,
    title,
    description,
  }));
}
