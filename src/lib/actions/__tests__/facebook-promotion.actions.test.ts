import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  touch: vi.fn(),
  getListing: vi.fn(),
  checkRange: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/facebook-destination.service", () => ({
  listHostFacebookDestinations: mocks.list,
  createHostFacebookDestination: mocks.create,
  updateHostFacebookDestination: mocks.update,
  deleteHostFacebookDestination: mocks.remove,
  touchHostFacebookDestination: mocks.touch,
}));
vi.mock("@/lib/services/listing-promotion.service", () => ({
  getPromotionListing: mocks.getListing,
  checkPromotionRange: mocks.checkRange,
}));

import {
  checkPromotionRangeAction,
  createFacebookDestinationAction,
  deleteFacebookDestinationAction,
  getPromotionWorkspaceAction,
  listFacebookDestinationsAction,
  markFacebookDestinationUsedAction,
  updateFacebookDestinationAction,
} from "@/lib/actions/facebook-promotion.actions";

describe("promotion action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ ok: true, data: { id: "d1" } });
    mocks.update.mockResolvedValue({ ok: true, data: { id: "d1" } });
    mocks.remove.mockResolvedValue({ ok: true, data: { id: "d1" } });
    mocks.touch.mockResolvedValue({ ok: true, data: { id: "d1" } });
    mocks.getListing.mockResolvedValue({ id: "listing-1" });
    mocks.checkRange.mockResolvedValue({ ok: true, nights: 7 });
  });

  it("passes the session's host id into every read and mutation", async () => {
    await listFacebookDestinationsAction();
    await createFacebookDestinationAction({ name: "G", url: "u" });
    await updateFacebookDestinationAction("d1", { name: "G2" });
    await deleteFacebookDestinationAction("d1");
    await markFacebookDestinationUsedAction("d1");
    await getPromotionWorkspaceAction("listing-1");
    await checkPromotionRangeAction("listing-1", "2026-10-01", "2026-10-08");

    expect(mocks.list).toHaveBeenCalledWith("host-1");
    expect(mocks.create).toHaveBeenCalledWith("host-1", { name: "G", url: "u" });
    expect(mocks.update).toHaveBeenCalledWith("host-1", "d1", {
      name: "G2",
      url: undefined,
      favorite: undefined,
    });
    expect(mocks.remove).toHaveBeenCalledWith("host-1", "d1");
    expect(mocks.touch).toHaveBeenCalledWith("host-1", "d1");
    expect(mocks.getListing).toHaveBeenCalledWith("host-1", "listing-1");
    expect(mocks.checkRange).toHaveBeenCalledWith(
      "host-1",
      "listing-1",
      "2026-10-01",
      "2026-10-08",
    );
  });

  it("refuses every action for a signed-out caller without entering the service", async () => {
    mocks.auth.mockResolvedValue(null);

    for (const call of [
      listFacebookDestinationsAction(),
      createFacebookDestinationAction({ name: "G", url: "u" }),
      updateFacebookDestinationAction("d1", { name: "G2" }),
      deleteFacebookDestinationAction("d1"),
      markFacebookDestinationUsedAction("d1"),
      getPromotionWorkspaceAction("listing-1"),
      checkPromotionRangeAction("listing-1", "2026-10-01", "2026-10-08"),
    ]) {
      expect(await call).toEqual({ ok: false, error: "UNAUTHORIZED" });
    }

    for (const service of [
      mocks.list,
      mocks.create,
      mocks.update,
      mocks.remove,
      mocks.touch,
      mocks.getListing,
      mocks.checkRange,
    ]) {
      expect(service).not.toHaveBeenCalled();
    }
  });

  it("reports a listing this host cannot promote without leaking why", async () => {
    mocks.getListing.mockResolvedValue(null);

    expect(await getPromotionWorkspaceAction("listing-1")).toEqual({
      ok: false,
      error: "LISTING_NOT_PROMOTABLE",
    });
  });

  it("forwards service error codes verbatim so the dialog can pick its own copy", async () => {
    mocks.create.mockResolvedValue({ ok: false, error: "DUPLICATE" });

    expect(
      await createFacebookDestinationAction({ name: "G", url: "u" }),
    ).toEqual({ ok: false, error: "DUPLICATE" });
  });

  it("treats malformed action payloads as empty input instead of throwing", async () => {
    await createFacebookDestinationAction(null);
    await updateFacebookDestinationAction("d1", null);

    expect(mocks.create).toHaveBeenCalledWith("host-1", { name: "", url: "" });
    expect(mocks.update).toHaveBeenCalledWith("host-1", "d1", {
      name: undefined,
      url: undefined,
      favorite: undefined,
    });
  });

  it("returns a failed range check as data rather than as an action error", async () => {
    // The dialog needs the reason to choose an actionable sentence; an error string
    // would flatten "already booked" and "too short" into the same message.
    mocks.checkRange.mockResolvedValue({ ok: false, reason: "ALREADY_BOOKED" });

    expect(
      await checkPromotionRangeAction("listing-1", "2026-10-01", "2026-10-08"),
    ).toEqual({ ok: true, data: { ok: false, reason: "ALREADY_BOOKED" } });
  });
});
