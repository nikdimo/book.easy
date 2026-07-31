import {
  LISTING_STEPS,
  resumeListingStep,
} from "@/lib/constants/listing-steps";
import type { ListingDraftData } from "@/lib/types/listing-draft";

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

/** Where a draft will reopen, resolved for display. */
export interface MobileDraftStep {
  id: string;
  title: string;
  /** 1-based, for "Step 4 of 10". */
  position: number;
  total: number;
}

/** Summarises a draft's progress the same way the web listings page does — by id
 *  first, legacy index only as a fallback — so the two never disagree about where a
 *  host left off. Resolved here rather than in the client so the listings screen
 *  needs no step titles of its own. */
export function resolveMobileDraftStep(data: ListingDraftData): MobileDraftStep {
  const index = resumeListingStep(data.currentStepId, data.currentStep);
  const step = LISTING_STEPS[index];
  return {
    id: step.id,
    title: step.title,
    position: index + 1,
    total: LISTING_STEPS.length,
  };
}
