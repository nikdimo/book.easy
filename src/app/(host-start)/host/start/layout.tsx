import { cookies } from "next/headers";
import { HostStartDraftProvider } from "@/components/host/v2/listings/host-start-draft-provider";
import { RegionalSettingsLauncher } from "@/components/shared/regional-settings-launcher";
import { requireHostPage } from "@/lib/auth-helpers";
import { HOST_START_DRAFT_COOKIE } from "@/lib/host-start-draft";
import { listingDraftData } from "@/lib/mobile-listing-draft";
import { getHostListingDraft } from "@/lib/services/listing.service";

export default async function HostStartLayout({ children }: { children: React.ReactNode }) {
  const [host, store] = await Promise.all([requireHostPage(), cookies()]);
  const draftId = store.get(HOST_START_DRAFT_COOKIE)?.value ?? null;
  const draft = draftId ? await getHostListingDraft(draftId, host.id) : null;

  return (
    <HostStartDraftProvider
      initialDraftId={draft?.id ?? null}
      initialData={draft ? listingDraftData(draft.data) : {}}
    >
      {children}
      {/*
       * Mounted once for the whole flow rather than on each of its fourteen steps.
       * The dialog is triggerless here: every screen's header carries its own
       * `RegionalSettingsTrigger`, which opens this one by window event. Rendering it
       * per step would mean fourteen copies of a rate fetch and a language query, and
       * a dialog that unmounts on every navigation.
       */}
      <RegionalSettingsLauncher hideTrigger />
    </HostStartDraftProvider>
  );
}
