import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), active: vi.fn(), option: vi.fn(), editor: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { listing: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/services/property-type.service", () => ({ getActivePropertyTypes: mocks.active, getPropertyTypeOption: mocks.option }));
vi.mock("@/lib/services/listing-editor.service", () => ({ getListingEditorData: mocks.editor }));
import { getListingPropertyDetailsEditorData } from "../listing-property-details.service";

beforeEach(() => { vi.clearAllMocks(); mocks.active.mockResolvedValue([]); mocks.option.mockResolvedValue({ value: "HOUSE", label: "House", icon: "House", description: "" }); mocks.editor.mockResolvedValue({ rooms: [], roomTypes: [] }); });

describe("property details service", () => {
  it("scopes the read to the authenticated host", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await getListingPropertyDetailsEditorData("listing-1", "host-1")).toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }));
  });
  it("keeps an inactive legacy property type visible", async () => {
    mocks.findFirst.mockResolvedValue({ id: "listing-1", slug: "home", status: "DRAFT", spaceType: "PRIVATE_ROOM", bedrooms: 1, beds: 1, bathrooms: 1, property: { propertyType: "LEGACY_HOME" } });
    mocks.active.mockResolvedValue([{ value: "HOUSE", label: "House" }]);
    mocks.option.mockResolvedValue({ value: "LEGACY_HOME", label: "Legacy home" });
    const result = await getListingPropertyDetailsEditorData("listing-1", "host-1");
    expect(result?.propertyTypes.map((type) => type.value)).toEqual(["LEGACY_HOME", "HOUSE"]);
    expect(result?.stored.spaceType).toBe("PRIVATE_ROOM");
  });
});
