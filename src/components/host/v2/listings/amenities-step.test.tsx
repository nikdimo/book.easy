import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AmenitiesStep } from "@/components/host/v2/listings/amenities-step";
import {
  displayableAmenities,
  toggleAmenitySelection,
} from "@/lib/host/v2/amenity-picker";
import type { CatalogAmenity, CatalogCategory } from "@/lib/types/amenity-catalog";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

function category(
  key: string,
  name: string,
  sortOrder: number,
  overrides: Partial<CatalogCategory> = {},
): CatalogCategory {
  return {
    id: `cat-${key}`,
    key,
    name,
    label: name,
    translated: false,
    icon: null,
    sortOrder,
    ...overrides,
  };
}

const essentials = category("essentials", "Essentials", 10);
const kitchenCat = category("kitchen", "Kitchen", 40);
const safety = category("safety", "Safety", 100);
const outdoor = category("outdoor", "Outdoor", 60);

function amenity(
  key: string,
  name: string,
  cat: CatalogCategory,
  overrides: Partial<CatalogAmenity> = {},
): CatalogAmenity {
  return {
    id: `am-${key}`,
    key,
    name,
    label: name,
    translated: false,
    icon: null,
    sortOrder: 0,
    category: cat,
    ...overrides,
  };
}

/** A slice of the real catalog: three real categories, two of which hold "popular"
 *  keys (wifi, heating, kitchen, smoke_detector), one non-popular row (balcony) to prove
 *  the catalog isn't trimmed, and the "essentials" provider-noise duplicate the shared
 *  display rules are expected to suppress until it's selected. */
const catalog: CatalogAmenity[] = [
  amenity("wifi", "Wi-Fi", essentials, { sortOrder: 10 }),
  amenity("heating", "Heating", essentials, { sortOrder: 20 }),
  amenity("essentials", "Essentials", essentials, { sortOrder: 30 }),
  amenity("kitchen", "Full kitchen", kitchenCat, { sortOrder: 10 }),
  amenity("smoke_detector", "Smoke detector", safety, { sortOrder: 10 }),
  amenity("balcony", "Balcony", outdoor, { sortOrder: 10 }),
];

function step(overrides: Partial<ComponentProps<typeof AmenitiesStep>> = {}) {
  return renderToStaticMarkup(
    <AmenitiesStep
      propertyType={house}
      spaceType="ENTIRE_PLACE"
      catalog={catalog}
      {...overrides}
    />,
  );
}

describe("AmenitiesStep — popular view", () => {
  it("renders the heading, hint and selected count", () => {
    const html = step();

    expect(html).toContain("Tell guests which amenities they");
    expect(html).toContain("You can add more amenities after you publish your listing.");
    expect(html).toContain("Popular amenities");
  });

  it("shows only the promoted rows, in the configured promotion order, not the full catalog", () => {
    const html = step();

    // wifi, heating, kitchen and smoke_detector are on the promotion list.
    expect(html).toContain("Wi-Fi");
    expect(html).toContain("Full kitchen");
    expect(html).toContain("Smoke detector");
    // Promotion order is wifi, kitchen, ..., heating — not the catalog's own order.
    expect(html.indexOf("Wi-Fi")).toBeLessThan(html.indexOf("Full kitchen"));
    expect(html.indexOf("Full kitchen")).toBeLessThan(html.indexOf("Heating"));
    // "Balcony" is not on the promotion list, so the popular view must not show it.
    expect(html).not.toContain("Balcony");
    // No category headings in the popular view — it is one flat promoted list.
    expect(html).not.toContain("Essentials</h2>");
    expect(html).not.toContain("Kitchen</h2>");
  });

  it("offers a prominent, accessible control to view the full catalog", () => {
    const html = step();

    expect(html).toContain("View all amenities");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="amenity-catalog-panel"');
  });

  it("marks selected amenities as pressed and reports the count", () => {
    const html = step({ initialSelectedIds: ["am-wifi"] });
    const wifi = html.slice(html.indexOf("aria-pressed"), html.indexOf("Wi-Fi"));

    expect(wifi).toContain('aria-pressed="true"');
    expect(html).toContain("1 amenity selected");
  });

  it("keeps the step UI-only: no form, no submit, no persistence", () => {
    const html = step();

    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
  });

  it("goes back to phase one complete and on to photos with the flow's query parameters", () => {
    const html = step();

    expect(html).toContain(
      'href="/host/start/phase-one-complete?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
    expect(html).toContain(
      'href="/host/start/photos?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("starts the second progress segment while leaving phase one full", () => {
    const html = step();
    const bars = [...html.matchAll(/style="width:(\d+)%"/g)].map((match) => match[1]);

    expect(bars).toEqual(["100", "20"]);
  });
});

describe("AmenitiesStep — expanded view", () => {
  it("reveals the complete displayable catalog, grouped by category", () => {
    const html = step({ initialExpanded: true });

    expect(html).toContain("Balcony");
    expect(html).toContain("Essentials</h2>");
    expect(html).toContain("Kitchen</h2>");
    expect(html).toContain("Outdoor</h2>");
    // Categories still follow AmenityCategory.sortOrder.
    expect(html.indexOf("Essentials</h2>")).toBeLessThan(html.indexOf("Kitchen</h2>"));
    expect(html.indexOf("Kitchen</h2>")).toBeLessThan(html.indexOf("Outdoor</h2>"));
  });

  it("still hides catalog rows the shared display rules suppress until they are selected", () => {
    expect(step({ initialExpanded: true })).not.toContain(">Everyday essentials<");
    expect(
      step({ initialExpanded: true, initialSelectedIds: ["am-essentials"] }),
    ).toContain("Everyday essentials");
  });

  it("offers a control back to the popular view", () => {
    const html = step({ initialExpanded: true });

    expect(html).toContain("Show popular only");
    expect(html).toContain('aria-expanded="true"');
  });

  it("filters by search across display label and source name", () => {
    const html = step({ initialExpanded: true, initialSearch: "balcony" });

    expect(html).toContain("Balcony");
    expect(html).not.toContain("Wi-Fi");
    expect(html).not.toContain("Full kitchen");
  });

  it("filters by category chip", () => {
    const html = step({ initialExpanded: true, initialChip: "cat-kitchen" });

    expect(html).toContain("Full kitchen");
    expect(html).not.toContain("Wi-Fi");
    expect(html).not.toContain("Balcony");
  });

  it("filters to selected amenities only", () => {
    const html = step({
      initialExpanded: true,
      initialChip: "selected",
      initialSelectedIds: ["am-wifi"],
    });

    expect(html).toContain("Wi-Fi");
    expect(html).not.toContain("Full kitchen");
    expect(html).not.toContain("Balcony");
  });

  it("shows a clean empty state when filters produce no results", () => {
    const html = step({ initialExpanded: true, initialSearch: "nonexistent-amenity" });

    expect(html).toContain("No amenities found");
    expect(html).toContain("Clear search and filters");
  });

  it("keeps selection state independent of the active filter", () => {
    // Selecting an amenity while a category filter is active must not lose it once the
    // view is filtered elsewhere — the selection lives in a Set the filters never touch.
    const html = step({
      initialExpanded: true,
      initialChip: "cat-kitchen",
      initialSelectedIds: ["am-wifi", "am-kitchen"],
    });
    const kitchen = html.slice(html.indexOf("aria-pressed"), html.indexOf("Full kitchen"));

    expect(kitchen).toContain('aria-pressed="true"');
  });

  it("uses the same AmenityPickerCard grid class as the popular view", () => {
    const popular = step();
    const expanded = step({ initialExpanded: true });
    const gridClassMatch = popular.match(/class="(grid auto-rows-fr[^"]*)"/);

    expect(gridClassMatch).not.toBeNull();
    expect(expanded).toContain(gridClassMatch![1]);
  });
});

describe("amenity picker state", () => {
  it("toggles an id on and off without mutating the previous set", () => {
    const empty = new Set<string>();
    const one = toggleAmenitySelection(empty, "am-wifi");

    expect([...one]).toEqual(["am-wifi"]);
    expect(empty.size).toBe(0);
    expect([...toggleAmenitySelection(one, "am-wifi")]).toEqual([]);
    expect([...one]).toEqual(["am-wifi"]);
  });

  it("offers the editor and the create flow exactly the same rows", () => {
    const keys = displayableAmenities(catalog, new Set()).map((row) => row.key);

    expect(keys).toEqual(["wifi", "heating", "kitchen", "smoke_detector", "balcony"]);
  });
});
