import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/listing-property-details.actions", () => ({ updateListingPropertyDetails: vi.fn() }));
vi.mock("@/lib/actions/listing-photos.actions", () => ({ addListingRoom: vi.fn(), deleteListingRoom: vi.fn(), renameListingRoom: vi.fn() }));
import { PropertyDetailsWorkspace } from "../rooms/property-details-workspace";

describe("PropertyDetailsWorkspace", () => {
  it("renders stored values, all requested controls, and no maximum-guests editor", () => {
    const html = renderToStaticMarkup(<PropertyDetailsWorkspace listingId="listing-1" stored={{ propertyType: "HOUSE", spaceType: "PRIVATE_ROOM", bedrooms: 2, beds: 3, bathrooms: 1 }} propertyTypes={[{ value: "HOUSE", label: "House", icon: "House", description: "" }]} rooms={[{ id: "room-1", roomTypeId: "type-1", roomTypeKey: "bedroom", name: "Bedroom 1", translated: false, icon: "Bed", ordinal: 1, sortOrder: 0, photoCount: 2, coverUrl: null }]} roomTypes={[]} />);
    expect(html).toContain('aria-label="Property type"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Bedrooms: 2"');
    expect(html).toContain('aria-label="Beds: 3"');
    expect(html).toContain('aria-label="Bathrooms: 1"');
    expect(html).toContain("Bedroom 1");
    expect(html).not.toContain("Maximum guests");
  });
});
