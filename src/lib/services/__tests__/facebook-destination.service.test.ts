import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { hostFacebookDestination: mocks },
}));

import {
  createHostFacebookDestination,
  deleteHostFacebookDestination,
  listHostFacebookDestinations,
  touchHostFacebookDestination,
  updateHostFacebookDestination,
} from "@/lib/services/facebook-destination.service";

const CANONICAL = "https://www.facebook.com/groups/skopjerentals";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "destination-1",
    name: "Skopje Rentals",
    url: CANONICAL,
    favorite: false,
    lastUsedAt: null,
    ...overrides,
  };
}

describe("host Facebook destinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(row());
    mocks.create.mockResolvedValue(row());
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.findMany.mockResolvedValue([]);
  });

  it("lists only this host's rows, favourites and recent use first", async () => {
    await listHostFacebookDestinations("host-1");

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostId: "host-1" },
        orderBy: [
          { favorite: "desc" },
          { lastUsedAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
      }),
    );
  });

  it("serializes lastUsedAt across the action boundary", async () => {
    mocks.findMany.mockResolvedValue([
      row({ lastUsedAt: new Date("2026-08-30T09:00:00.000Z") }),
    ]);

    const [first] = await listHostFacebookDestinations("host-1");
    expect(first.lastUsedAt).toBe("2026-08-30T09:00:00.000Z");
  });

  it("stores the normalized URL rather than what was pasted", async () => {
    await createHostFacebookDestination("host-1", {
      name: "  Skopje   Rentals ",
      url: "https://m.facebook.com/groups/SkopjeRentals/?ref=share",
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hostId: "host-1",
          name: "Skopje Rentals",
          url: CANONICAL,
        }),
      }),
    );
  });

  it("refuses a link that is not a Facebook group, without touching the database", async () => {
    const result = await createHostFacebookDestination("host-1", {
      name: "Somewhere",
      url: "https://evil.example/groups/x",
    });

    expect(result).toEqual({ ok: false, error: "INVALID_URL" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses a nameless group", async () => {
    const result = await createHostFacebookDestination("host-1", {
      name: "   ",
      url: CANONICAL,
    });

    expect(result).toEqual({ ok: false, error: "NAME_REQUIRED" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("prevents the same group being saved twice by the same host", async () => {
    mocks.findUnique.mockResolvedValue({ id: "destination-1" });

    const result = await createHostFacebookDestination("host-1", {
      name: "Skopje Rentals again",
      // A different spelling of a group already saved — the duplicate check runs on
      // the normalized form, which is the whole point of normalizing before writing.
      url: "https://web.facebook.com/groups/skopjerentals/",
    });

    expect(result).toEqual({ ok: false, error: "DUPLICATE" });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { hostId_url: { hostId: "host-1", url: CANONICAL } },
      select: { id: true },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reports a unique-constraint race as a duplicate rather than throwing", async () => {
    mocks.create.mockRejectedValue({ code: "P2002" });

    expect(
      await createHostFacebookDestination("host-1", {
        name: "Skopje Rentals",
        url: CANONICAL,
      }),
    ).toEqual({ ok: false, error: "DUPLICATE" });
  });

  it("does not disguise an unrelated database failure as a duplicate", async () => {
    mocks.create.mockRejectedValue(new Error("database unavailable"));

    await expect(
      createHostFacebookDestination("host-1", {
        name: "Skopje Rentals",
        url: CANONICAL,
      }),
    ).rejects.toThrow("database unavailable");
  });

  it("caps how many groups one account can hoard", async () => {
    mocks.count.mockResolvedValue(50);

    expect(
      await createHostFacebookDestination("host-1", {
        name: "One more",
        url: CANONICAL,
      }),
    ).toEqual({ ok: false, error: "LIMIT_REACHED" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("scopes a rename by host, so an id alone cannot reach another host's row", async () => {
    await updateHostFacebookDestination("host-1", "destination-1", {
      name: "Ohrid Rentals",
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "destination-1", hostId: "host-1" },
      data: { name: "Ohrid Rentals" },
    });
  });

  it("reports another host's row as missing rather than editing it", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await updateHostFacebookDestination("host-2", "destination-1", {
        name: "Stolen",
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("refuses to re-point a group onto a URL the host already saved elsewhere", async () => {
    mocks.findUnique.mockResolvedValue({ id: "destination-9" });

    expect(
      await updateHostFacebookDestination("host-1", "destination-1", {
        url: CANONICAL,
      }),
    ).toEqual({ ok: false, error: "DUPLICATE" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("reports an update unique-constraint race as a duplicate", async () => {
    mocks.updateMany.mockRejectedValue({ code: "P2002" });

    expect(
      await updateHostFacebookDestination("host-1", "destination-1", {
        url: CANONICAL,
      }),
    ).toEqual({ ok: false, error: "DUPLICATE" });
  });

  it("allows re-saving the same URL onto the row that already holds it", async () => {
    mocks.findUnique.mockResolvedValue({ id: "destination-1" });

    const result = await updateHostFacebookDestination("host-1", "destination-1", {
      url: "https://m.facebook.com/groups/skopjerentals",
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "destination-1", hostId: "host-1" },
      data: { url: CANONICAL },
    });
  });

  it("scopes deletion by host", async () => {
    expect(await deleteHostFacebookDestination("host-1", "destination-1")).toEqual({
      ok: true,
      data: { id: "destination-1" },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "destination-1", hostId: "host-1" },
    });
  });

  it("does not delete a row belonging to someone else", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    expect(await deleteHostFacebookDestination("host-2", "destination-1")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("records that a group was opened, scoped by host", async () => {
    const now = new Date("2026-08-30T10:00:00.000Z");
    await touchHostFacebookDestination("host-1", "destination-1", now);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "destination-1", hostId: "host-1" },
      data: { lastUsedAt: now },
    });
  });
});
