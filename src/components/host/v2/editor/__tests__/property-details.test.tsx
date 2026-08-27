import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/listing-property-details.actions", () => ({ updateListingPropertyDetails: vi.fn() }));
vi.mock("@/lib/actions/listing-photos.actions", () => ({ addListingRoom: vi.fn(), deleteListingRoom: vi.fn(), renameListingRoom: vi.fn() }));
import { PropertyDetailsWorkspace } from "../rooms/property-details-workspace";
import type { ListingRoomSummary } from "@/lib/types/room-catalog";

const BEDROOM = { id: "type-bedroom", isRepeatable: true };
const BATHROOM = { id: "type-bathroom", isRepeatable: true };

function room(overrides: Partial<ListingRoomSummary> & Pick<ListingRoomSummary, "id" | "roomTypeId" | "name">): ListingRoomSummary {
  return { roomTypeKey: "bedroom", translated: false, icon: "Bed", ordinal: 1, sortOrder: 0, photoCount: 0, coverUrl: null, ...overrides };
}

function render(rooms: ListingRoomSummary[], stored?: Partial<{ bedrooms: number; beds: number; bathrooms: number }>) {
  return renderToStaticMarkup(
    <PropertyDetailsWorkspace
      listingId="listing-1"
      stored={{ propertyType: "HOUSE", spaceType: "PRIVATE_ROOM", bedrooms: 2, beds: 3, bathrooms: 1, ...stored }}
      propertyTypes={[{ value: "HOUSE", label: "House", icon: "House", description: "" }]}
      rooms={rooms}
      roomTypes={[]}
      countedTypes={{ bedroom: BEDROOM, bathroom: BATHROOM }}
    />,
  );
}

describe("PropertyDetailsWorkspace", () => {
  it("renders stored values, all requested controls, and no maximum-guests editor", () => {
    const html = render([
      room({ id: "room-1", roomTypeId: BEDROOM.id, name: "Bedroom 1", photoCount: 2 }),
      room({ id: "room-2", roomTypeId: BEDROOM.id, name: "Bedroom 2", ordinal: 2 }),
      room({ id: "room-3", roomTypeId: BATHROOM.id, name: "Bathroom", roomTypeKey: "bathroom" }),
    ]);
    expect(html).toContain('aria-label="Property type"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Bedrooms: 2"');
    expect(html).toContain('aria-label="Beds: 3"');
    expect(html).toContain('aria-label="Bathrooms: 1"');
    expect(html).toContain("Bedroom 1");
    expect(html).not.toContain("Maximum guests");
  });

  it("counts the rooms rather than the stored number, so the two cannot disagree", () => {
    // The listing row still says two bedrooms; three bedroom rooms exist. The rooms win.
    const html = render([
      room({ id: "room-1", roomTypeId: BEDROOM.id, name: "Bedroom 1" }),
      room({ id: "room-2", roomTypeId: BEDROOM.id, name: "Bedroom 2", ordinal: 2 }),
      room({ id: "room-3", roomTypeId: BEDROOM.id, name: "Bedroom 3", ordinal: 3 }),
    ]);
    expect(html).toContain('aria-label="Bedrooms: 3"');
    expect(html).toContain('aria-label="Bathrooms: 0"');
  });

  it("shows each room's photo count so an empty room is visible before publishing", () => {
    const html = render([
      room({ id: "room-1", roomTypeId: BEDROOM.id, name: "Bedroom 1", photoCount: 4 }),
      room({ id: "room-2", roomTypeId: BEDROOM.id, name: "Bedroom 2", ordinal: 2 }),
    ]);
    expect(html).toContain("4 photos");
    expect(html).toContain("No photos yet");
  });

  it("lists anything that is not a bedroom or bathroom under other spaces", () => {
    const html = render([
      room({ id: "room-1", roomTypeId: "type-kitchen", roomTypeKey: "kitchen", name: "Kitchen", icon: "CookingPot" }),
    ]);
    expect(html).toContain("Kitchen");
    expect(html).toContain('aria-label="Bedrooms: 0"');
    expect(html).not.toContain("add the spaces you have photos of");
  });

  it("falls back to the stored count when the taxonomy has no type to count", () => {
    const html = renderToStaticMarkup(
      <PropertyDetailsWorkspace
        listingId="listing-1"
        stored={{ propertyType: "HOUSE", spaceType: "PRIVATE_ROOM", bedrooms: 2, beds: 3, bathrooms: 1 }}
        propertyTypes={[{ value: "HOUSE", label: "House", icon: "House", description: "" }]}
        rooms={[]}
        roomTypes={[]}
        countedTypes={{ bedroom: null, bathroom: null }}
      />,
    );
    expect(html).toContain('aria-label="Bedrooms: 2"');
    expect(html).toContain('aria-label="Bathrooms: 1"');
  });
});
