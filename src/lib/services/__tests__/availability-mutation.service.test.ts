import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockType } from "@prisma/client";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    availabilityBlock: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    listingAvailabilityWindow: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    listingDatePrice: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    tx,
    transaction: vi.fn(),
    listingFindFirst: vi.fn(),
    availabilityBlockDeleteMany: vi.fn(),
    availabilityBlockFindFirst: vi.fn(),
    availabilityBlockDelete: vi.fn(),
    pricingRuleFindUnique: vi.fn(),
    listingDatePriceDeleteMany: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    listing: { findFirst: mocks.listingFindFirst },
    availabilityBlock: {
      deleteMany: mocks.availabilityBlockDeleteMany,
      findFirst: mocks.availabilityBlockFindFirst,
      delete: mocks.availabilityBlockDelete,
    },
    pricingRule: { findUnique: mocks.pricingRuleFindUnique },
    listingDatePrice: { deleteMany: mocks.listingDatePriceDeleteMany },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  mutateAvailabilityForManagedListing,
  resolveAvailabilityCoreOperation,
  verifyAvailabilityManager,
} from "@/lib/services/availability-mutation.service";

const openListing = {
  id: "listing-1",
  slug: "lake-house",
  availabilityMode: "OPEN" as const,
};
const closedListing = { ...openListing, availabilityMode: "CLOSED" as const };

describe("availability mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (run: (tx: typeof mocks.tx) => Promise<unknown>) => run(mocks.tx),
    );
    mocks.tx.$executeRaw.mockResolvedValue(undefined);
    mocks.tx.availabilityBlock.findMany.mockResolvedValue([]);
    mocks.tx.listingAvailabilityWindow.findMany.mockResolvedValue([]);
    mocks.tx.availabilityBlock.create.mockResolvedValue({});
    mocks.tx.availabilityBlock.delete.mockResolvedValue({});
    mocks.tx.listingAvailabilityWindow.create.mockResolvedValue({});
    mocks.tx.listingAvailabilityWindow.delete.mockResolvedValue({});
    mocks.tx.listingAvailabilityWindow.deleteMany.mockResolvedValue({ count: 0 });
    mocks.availabilityBlockDeleteMany.mockResolvedValue({ count: 0 });
    mocks.pricingRuleFindUnique.mockResolvedValue({ baseNightlyRate: 100 });
    mocks.tx.listingDatePrice.upsert.mockResolvedValue({});
    mocks.tx.listingDatePrice.deleteMany.mockResolvedValue({ count: 0 });
    mocks.listingDatePriceDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("scopes host lookup to hostId while admins may manage any listing", async () => {
    mocks.listingFindFirst.mockResolvedValue(openListing);

    await verifyAvailabilityManager({ id: "host-1", role: "HOST" }, "listing-1");
    expect(mocks.listingFindFirst).toHaveBeenLastCalledWith({
      where: { id: "listing-1", hostId: "host-1" },
      select: { id: true, slug: true, availabilityMode: true },
    });

    await verifyAvailabilityManager({ id: "admin-1", role: "ADMIN" }, "listing-1");
    expect(mocks.listingFindFirst).toHaveBeenLastCalledWith({
      where: { id: "listing-1" },
      select: { id: true, slug: true, availabilityMode: true },
    });
  });

  it("OPEN open-range queries and removes only manual blocks", async () => {
    mocks.tx.availabilityBlock.findMany.mockResolvedValue([
      {
        id: "manual-1",
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-13T00:00:00.000Z"),
        reason: "Owner stay",
      },
    ]);

    await mutateAvailabilityForManagedListing(openListing, "OPEN_RANGE", {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
    });

    expect(mocks.tx.availabilityBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ blockType: BlockType.MANUAL_BLOCK }),
      }),
    );
    expect(mocks.tx.availabilityBlock.delete).toHaveBeenCalledWith({
      where: { id: "manual-1" },
    });
    expect(mocks.tx.listingAvailabilityWindow.create).not.toHaveBeenCalled();
  });

  it("updates the private note on an existing exact manual block", async () => {
    mocks.tx.availabilityBlock.findMany.mockResolvedValue([
      {
        id: "manual-1",
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-13T00:00:00.000Z"),
        blockType: BlockType.MANUAL_BLOCK,
        reason: "Old note",
      },
    ]);

    await mutateAvailabilityForManagedListing(openListing, "BLOCK_RANGE", {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      reason: "New note",
    });

    expect(mocks.tx.availabilityBlock.delete).toHaveBeenCalledWith({
      where: { id: "manual-1" },
    });
    expect(mocks.tx.availabilityBlock.create).toHaveBeenCalledWith({
      data: {
        listingId: "listing-1",
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-13T00:00:00.000Z"),
        blockType: BlockType.MANUAL_BLOCK,
        reason: "New note",
      },
    });
  });

  it("splits a manual block so dates outside the selection keep their note", async () => {
    mocks.tx.availabilityBlock.findMany.mockResolvedValue([
      {
        id: "manual-1",
        startDate: new Date("2026-09-08T00:00:00.000Z"),
        endDate: new Date("2026-09-15T00:00:00.000Z"),
        blockType: BlockType.MANUAL_BLOCK,
        reason: "Owner stay",
      },
    ]);

    await mutateAvailabilityForManagedListing(openListing, "BLOCK_RANGE", {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      reason: null,
    });

    expect(mocks.tx.availabilityBlock.create).toHaveBeenCalledTimes(3);
    expect(mocks.tx.availabilityBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startDate: new Date("2026-09-08T00:00:00.000Z"),
        endDate: new Date("2026-09-10T00:00:00.000Z"),
        reason: "Owner stay",
      }),
    });
    expect(mocks.tx.availabilityBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-13T00:00:00.000Z"),
        reason: null,
      }),
    });
    expect(mocks.tx.availabilityBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startDate: new Date("2026-09-13T00:00:00.000Z"),
        endDate: new Date("2026-09-15T00:00:00.000Z"),
        reason: "Owner stay",
      }),
    });
  });

  it("preserves existing notes when no note mutation was requested", async () => {
    mocks.tx.availabilityBlock.findMany.mockResolvedValue([
      {
        id: "manual-1",
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-13T00:00:00.000Z"),
        blockType: BlockType.MANUAL_BLOCK,
        reason: "Owner stay",
      },
    ]);

    await mutateAvailabilityForManagedListing(openListing, "BLOCK_RANGE", {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
    });

    expect(mocks.tx.availabilityBlock.delete).not.toHaveBeenCalled();
    expect(mocks.tx.availabilityBlock.create).not.toHaveBeenCalled();
  });

  it("never rewrites an imported block's provider reason", async () => {
    mocks.tx.availabilityBlock.findMany.mockResolvedValue([
      {
        id: "external-1",
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-13T00:00:00.000Z"),
        blockType: BlockType.EXTERNAL_SYNC,
        reason: "Airbnb",
      },
    ]);

    await mutateAvailabilityForManagedListing(openListing, "BLOCK_RANGE", {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      reason: "Private note",
    });

    expect(mocks.tx.availabilityBlock.delete).not.toHaveBeenCalled();
    expect(mocks.tx.availabilityBlock.create).not.toHaveBeenCalled();
  });

  it("CLOSED open-range merges overlapping or adjacent windows", async () => {
    mocks.tx.listingAvailabilityWindow.findMany.mockResolvedValue([
      {
        id: "window-before",
        startDate: new Date("2026-09-08T00:00:00.000Z"),
        endDate: new Date("2026-09-10T00:00:00.000Z"),
      },
      {
        id: "window-after",
        startDate: new Date("2026-09-13T00:00:00.000Z"),
        endDate: new Date("2026-09-15T00:00:00.000Z"),
      },
    ]);

    await mutateAvailabilityForManagedListing(closedListing, "OPEN_RANGE", {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
    });

    expect(mocks.tx.listingAvailabilityWindow.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["window-before", "window-after"] } },
    });
    expect(mocks.tx.listingAvailabilityWindow.create).toHaveBeenCalledWith({
      data: {
        listingId: "listing-1",
        startDate: new Date("2026-09-08T00:00:00.000Z"),
        endDate: new Date("2026-09-15T00:00:00.000Z"),
      },
    });
  });

  it("CLOSED block-range splits a surrounding open window", async () => {
    mocks.tx.listingAvailabilityWindow.findMany.mockResolvedValue([
      {
        id: "window-1",
        startDate: new Date("2026-09-08T00:00:00.000Z"),
        endDate: new Date("2026-09-15T00:00:00.000Z"),
      },
    ]);

    await mutateAvailabilityForManagedListing(closedListing, "BLOCK_RANGE", {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
    });

    expect(mocks.tx.listingAvailabilityWindow.delete).toHaveBeenCalledWith({
      where: { id: "window-1" },
    });
    expect(mocks.tx.listingAvailabilityWindow.create).toHaveBeenCalledTimes(2);
    expect(mocks.tx.listingAvailabilityWindow.create).toHaveBeenCalledWith({
      data: {
        listingId: "listing-1",
        startDate: new Date("2026-09-08T00:00:00.000Z"),
        endDate: new Date("2026-09-10T00:00:00.000Z"),
      },
    });
    expect(mocks.tx.listingAvailabilityWindow.create).toHaveBeenCalledWith({
      data: {
        listingId: "listing-1",
        startDate: new Date("2026-09-13T00:00:00.000Z"),
        endDate: new Date("2026-09-15T00:00:00.000Z"),
      },
    });
  });

  it("maps and executes distinct bulk mutations for OPEN and CLOSED modes", async () => {
    expect(resolveAvailabilityCoreOperation("OPEN", "OPEN_FUTURE")).toBe(
      "REMOVE_FUTURE_MANUAL_BLOCKS",
    );
    expect(resolveAvailabilityCoreOperation("OPEN", "BLOCK_FUTURE")).toBe(
      "ADD_FUTURE_MANUAL_BLOCKS",
    );
    expect(resolveAvailabilityCoreOperation("CLOSED", "OPEN_FUTURE")).toBe(
      "OPEN_FUTURE_WINDOW",
    );
    expect(resolveAvailabilityCoreOperation("CLOSED", "BLOCK_FUTURE")).toBe(
      "CLOSE_FUTURE_WINDOWS",
    );

    await mutateAvailabilityForManagedListing(openListing, "OPEN_FUTURE");
    expect(mocks.availabilityBlockDeleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ blockType: BlockType.MANUAL_BLOCK }),
    });

    await mutateAvailabilityForManagedListing(closedListing, "OPEN_FUTURE");
    expect(mocks.tx.listingAvailabilityWindow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingId: "listing-1",
        endDate: new Date("2100-01-01T00:00:00.000Z"),
      }),
    });
  });

  it("validates and writes date-price ranges through the verified listing context", async () => {
    const { setDatePriceRangeForManagedListing, resetDatePriceRangeForManagedListing } =
      await import("@/lib/services/availability-mutation.service");
    await expect(
      setDatePriceRangeForManagedListing(openListing, {
        startDate: "2026-09-10",
        endDate: "2026-09-13",
        nightlyRate: 0,
      }),
    ).resolves.toEqual({ error: "Enter a valid nightly price greater than zero" });
    expect(mocks.pricingRuleFindUnique).not.toHaveBeenCalled();

    await expect(
      setDatePriceRangeForManagedListing(openListing, {
        startDate: "2026-09-10",
        endDate: "2026-09-13",
        nightlyRate: 145,
      }),
    ).resolves.toEqual({ success: true });
    expect(mocks.tx.listingDatePrice.upsert).toHaveBeenCalledTimes(3);

    await expect(
      resetDatePriceRangeForManagedListing(openListing, {
        startDate: "2026-09-10",
        endDate: "2026-09-13",
      }),
    ).resolves.toEqual({ success: true });
    expect(mocks.listingDatePriceDeleteMany).toHaveBeenCalledWith({
      where: {
        listingId: "listing-1",
        date: {
          gte: new Date("2026-09-10T00:00:00.000Z"),
          lte: new Date("2026-09-13T00:00:00.000Z"),
        },
      },
    });
  });
});
