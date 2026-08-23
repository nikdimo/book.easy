import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The mobile app's draft delete.
 *
 * It used to run its own `deleteMany` and stop there, which left the photos the host had
 * uploaded on disk with nothing pointing at them. These tests pin it to the same shared
 * operation the web paths use — scoped to the caller's own draft, cleanup included.
 */
const mocks = vi.hoisted(() => ({
  requireMobileHost: vi.fn<(request: Request) => Promise<unknown>>(async () => ({
    user: { id: "host-1", isHost: true },
  })),
  deleteDraft: vi.fn<
    (args: { hostId: string; draftId: string }) => Promise<
      | { ok: true; draftId: string; cleanup: { deleted: string[]; kept: string[]; failed: string[] } }
      | { ok: false; status: number; error: string }
    >
  >(),
}));

vi.mock("@/lib/mobile-api", () => ({
  requireMobileHost: mocks.requireMobileHost,
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileJson: (_request: Request, body: unknown, init?: { status?: number }) =>
    Response.json(body, { status: init?.status ?? 200 }),
}));
vi.mock("@/lib/db", () => ({ db: { listingDraft: {} } }));
vi.mock("@/lib/listing-draft-cleanup", () => ({
  deleteOwnedListingDraftWithCleanup: mocks.deleteDraft,
}));

import { DELETE } from "@/app/api/mobile/v1/drafts/[id]/route";

async function call(id = "draft-1"): Promise<Response> {
  const response = await DELETE(
    new Request("https://example.test/api/mobile/v1/drafts/draft-1", { method: "DELETE" }),
    { params: Promise.resolve({ id }) },
  );
  // Every branch of the handler answers; the union only widens because the shared mobile
  // helpers are typed loosely.
  expect(response).toBeInstanceOf(Response);
  return response as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMobileHost.mockResolvedValue({ user: { id: "host-1", isHost: true } });
  mocks.deleteDraft.mockResolvedValue({
    ok: true,
    draftId: "draft-1",
    cleanup: { deleted: [], kept: [], failed: [] },
  });
});

describe("DELETE /api/mobile/v1/drafts/[id]", () => {
  it("deletes through the shared cleanup path, scoped to the authenticated host", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.deleteDraft).toHaveBeenCalledWith({ hostId: "host-1", draftId: "draft-1" });
  });

  it("answers 404 for a draft this host does not own", async () => {
    mocks.deleteDraft.mockResolvedValue({ ok: false, status: 404, error: "Draft not found" });

    const response = await call("someone-elses-draft");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Draft not found" });
  });

  it("never reaches the draft when the request is not an authenticated host", async () => {
    mocks.requireMobileHost.mockResolvedValue({
      response: Response.json({ error: "Host access required" }, { status: 403 }),
    });

    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
  });
});
