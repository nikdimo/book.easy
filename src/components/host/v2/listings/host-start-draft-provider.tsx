"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ListingDraftData } from "@/lib/types/listing-draft";

export type HostStartDraftPatch = Partial<ListingDraftData>;

type HostStartDraftContextValue = {
  draftId: string | null;
  data: ListingDraftData;
  save: (patch: HostStartDraftPatch) => Promise<boolean>;
};

const HostStartDraftContext = createContext<HostStartDraftContextValue>({
  draftId: null,
  data: {},
  save: async () => true,
});

export function HostStartDraftProvider({
  initialDraftId,
  initialData,
  children,
}: {
  initialDraftId: string | null;
  initialData: ListingDraftData;
  children: React.ReactNode;
}) {
  const [draftId, setDraftId] = useState(initialDraftId);
  const [data, setData] = useState(initialData);

  const save = useCallback(async (patch: HostStartDraftPatch) => {
    try {
      const response = await fetch("/api/host-start/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = (await response.json()) as
        | { success: true; draftId: string; data: ListingDraftData }
        | { error: string };
      if ("error" in result) {
        toast.error(result.error);
        return false;
      }
      setDraftId(result.draftId);
      setData(result.data);
      return true;
    } catch {
      toast.error("Your changes could not be saved. Please try again.");
      return false;
    }
  }, []);

  const value = useMemo(() => ({ draftId, data, save }), [data, draftId, save]);
  return <HostStartDraftContext.Provider value={value}>{children}</HostStartDraftContext.Provider>;
}

export function useHostStartDraft() {
  return useContext(HostStartDraftContext);
}
