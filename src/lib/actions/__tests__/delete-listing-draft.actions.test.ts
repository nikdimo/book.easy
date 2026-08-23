import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The draft-delete action behind the Host V2 list control (and the V1 button beside it).
 *
 * The shared cleanup operation is stubbed here on purpose — its own behaviour is proven in
 * `listing-draft-cleanup.test.ts`. What this file pins down is that the action routes
 * through it at all, rather than deleting the row on its own and leaving the photos.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ user: { id: "host-1", isHost: true } })),
  revalidatePath: vi.fn(),
  deleteDraft: vi.fn<
    (args: { hostId: string; draftId: string }) => Promise<
      | { ok: true; draftId: string; cleanup: { deleted: string[]; kept: string[]; failed: string[] } }
      | { ok: false; status: number; error: string }
    >
  >(async ({ draftId }) => ({
    ok: true as const,
    draftId,
    cleanup: { deleted: [], kept: [], failed: [] },
  })),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
// Partial: the action module's dependency graph also reaches `unstable_cache`, which the
// real module has to keep providing.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/listing-draft-cleanup", () => ({
  deleteOwnedListingDraftWithCleanup: mocks.deleteDraft,
}));

import { deleteListingDraft } from "@/lib/actions/listing.actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
  mocks.deleteDraft.mockResolvedValue({
    ok: true,
    draftId: "draft-1",
    cleanup: { deleted: [], kept: [], failed: [] },
  });
});

describe("deleteListingDraft", () => {
  it("deletes through the shared cleanup path, scoped to the signed-in host", async () => {
    await expect(deleteListingDraft("draft-1")).resolves.toEqual({ success: true });

    expect(mocks.deleteDraft).toHaveBeenCalledWith({ hostId: "host-1", draftId: "draft-1" });
  });

  it("rebuilds both listing surfaces the draft was showing on", async () => {
    await deleteListingDraft("draft-1");

    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/host/listings");
    expect(paths).toContain("/host/listings");
  });

  it("passes a refusal straight back, without claiming anything was deleted", async () => {
    mocks.deleteDraft.mockResolvedValue({ ok: false, status: 404, error: "Draft not found" });

    await expect(deleteListingDraft("draft-1")).resolves.toEqual({ error: "Draft not found" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("never reaches the draft at all when nobody is signed in", async () => {
    mocks.auth.mockResolvedValue(null as never);

    await expect(deleteListingDraft("draft-1")).resolves.toEqual({ error: "Not authorized" });
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
  });
});
