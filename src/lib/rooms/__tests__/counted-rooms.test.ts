import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roomTypeFindMany: vi.fn(),
  roomFindMany: vi.fn(),
  roomFindFirst: vi.fn(),
  roomCreateMany: vi.fn(),
  roomGroupBy: vi.fn(),
  listingUpdate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    roomType: { findMany: mocks.roomTypeFindMany },
    listingRoom: {
      findMany: mocks.roomFindMany,
      findFirst: mocks.roomFindFirst,
      createMany: mocks.roomCreateMany,
      groupBy: mocks.roomGroupBy,
    },
    listing: { update: mocks.listingUpdate },
  },
}));
import { db } from "@/lib/db";
import {
  countedRoomTypes,
  growRoomsOfType,
  seedListingRooms,
  syncListingCountsFromRooms,
} from "../counted-rooms";

const BEDROOM = { id: "type-bedroom", key: "bedroom" as const, isRepeatable: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roomTypeFindMany.mockResolvedValue([
    { id: "type-bedroom", key: "bedroom", name: "Bedroom", isRepeatable: true },
    { id: "type-bathroom", key: "bathroom", name: "Bathroom", isRepeatable: true },
  ]);
  mocks.roomFindMany.mockResolvedValue([]);
  mocks.roomFindFirst.mockResolvedValue(null);
  mocks.roomGroupBy.mockResolvedValue([]);
});

describe("countedRoomTypes", () => {
  it("finds both types by key", async () => {
    const types = await countedRoomTypes();
    expect(types.get("bedroom")).toEqual({ id: "type-bedroom", key: "bedroom", isRepeatable: true });
    expect(types.get("bathroom")?.id).toBe("type-bathroom");
  });

  it("falls back to the English name when an admin renamed the key", async () => {
    mocks.roomTypeFindMany.mockResolvedValue([
      { id: "type-x", key: "sleeping_room", name: "Bedroom", isRepeatable: true },
    ]);
    const types = await countedRoomTypes();
    expect(types.get("bedroom")?.id).toBe("type-x");
  });

  it("leaves a type the taxonomy does not have out of the map rather than throwing", async () => {
    mocks.roomTypeFindMany.mockResolvedValue([]);
    const types = await countedRoomTypes();
    expect(types.size).toBe(0);
  });
});

describe("growRoomsOfType", () => {
  it("creates only the rooms that are missing", async () => {
    mocks.roomFindMany.mockResolvedValue([{ ordinal: 1 }]);
    const total = await growRoomsOfType(db, "listing-1", BEDROOM, 3);
    expect(total).toBe(3);
    expect(mocks.roomCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ ordinal: 2 }),
          expect.objectContaining({ ordinal: 3 }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it("numbers past a gap rather than colliding with a room still on screen", async () => {
    // Bedroom 2 of three was deleted; the next one has to be 4, not 3.
    mocks.roomFindMany.mockResolvedValue([{ ordinal: 1 }, { ordinal: 3 }]);
    await growRoomsOfType(db, "listing-1", BEDROOM, 3);
    expect(mocks.roomCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ ordinal: 4 })] }),
    );
  });

  it("writes nothing when the listing already has enough", async () => {
    mocks.roomFindMany.mockResolvedValue([{ ordinal: 1 }, { ordinal: 2 }]);
    expect(await growRoomsOfType(db, "listing-1", BEDROOM, 2)).toBe(2);
    expect(mocks.roomCreateMany).not.toHaveBeenCalled();
  });

  it("caps a type that cannot repeat at one", async () => {
    await growRoomsOfType(db, "listing-1", { ...BEDROOM, isRepeatable: false }, 4);
    expect(mocks.roomCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ ordinal: 1 })] }),
    );
  });
});

describe("seedListingRooms", () => {
  it("creates the bedrooms and bathrooms the wizard was told about", async () => {
    await seedListingRooms(db, "listing-1", { bedrooms: 2, bathrooms: 1 });
    const created = mocks.roomCreateMany.mock.calls.flatMap(([call]) => call.data);
    expect(created.filter((row: { roomTypeId: string }) => row.roomTypeId === "type-bedroom")).toHaveLength(2);
    expect(created.filter((row: { roomTypeId: string }) => row.roomTypeId === "type-bathroom")).toHaveLength(1);
  });
});

describe("syncListingCountsFromRooms", () => {
  it("rewrites the listing's counts from the rooms that exist", async () => {
    mocks.roomGroupBy.mockResolvedValue([
      { roomTypeId: "type-bedroom", _count: { _all: 3 } },
    ]);
    await syncListingCountsFromRooms("listing-1");
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      // No bathroom rooms means zero bathrooms — the rooms are the answer either way.
      data: { bedrooms: 3, bathrooms: 0 },
    });
  });

  it("leaves a non-repeatable type's stored number alone", async () => {
    // One bathroom row is all the taxonomy allows, so it cannot speak for a listing
    // whose host legitimately entered three.
    mocks.roomTypeFindMany.mockResolvedValue([
      { id: "type-bedroom", key: "bedroom", name: "Bedroom", isRepeatable: true },
      { id: "type-bathroom", key: "bathroom", name: "Bathroom", isRepeatable: false },
    ]);
    mocks.roomGroupBy.mockResolvedValue([{ roomTypeId: "type-bedroom", _count: { _all: 2 } }]);
    await syncListingCountsFromRooms("listing-1");
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { bedrooms: 2 },
    });
  });

  it("writes nothing when the taxonomy has no countable type", async () => {
    mocks.roomTypeFindMany.mockResolvedValue([]);
    await syncListingCountsFromRooms("listing-1");
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });
});
