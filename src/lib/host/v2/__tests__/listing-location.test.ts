import { describe, expect, it } from "vitest";
import {
  listingLocationComplete,
  listingLocationIssues,
  mergeGeocodedAddress,
  metresBetween,
  planListingLocationSave,
  publicLocationChanged,
  resolveLocationCoordinates,
  resolveStreetView,
  validCoordinates,
  type ListingLocationInput,
  type StoredListingLocation,
} from "@/lib/host/v2/listing-location";

function stored(
  overrides: Partial<StoredListingLocation> = {},
): StoredListingLocation {
  return {
    address: "Partizanski odredi 15",
    city: "Skopje",
    area: "Centar",
    postalCode: "1000",
    country: "North Macedonia",
    latitude: 41.9981,
    longitude: 21.4254,
    locationSource: "AUTOCOMPLETE",
    geocodingProvider: "GOOGLE_PLACES",
    geocodingPlaceId: "place-1",
    streetViewHeading: 120,
    streetViewPitch: 5,
    streetViewPanoId: "pano-1",
    ...overrides,
  };
}

function input(
  overrides: Partial<ListingLocationInput> = {},
): ListingLocationInput {
  const base = stored();
  return {
    address: base.address,
    city: base.city,
    area: base.area,
    postalCode: base.postalCode,
    country: base.country,
    pin: null,
    streetView: { heading: 120, pitch: 5, panoId: "pano-1" },
    ...overrides,
  };
}

describe("validCoordinates", () => {
  it("rejects the null island an unset coordinate coerces to", () => {
    expect(validCoordinates(0, 0)).toBe(false);
    expect(validCoordinates(null, null)).toBe(false);
    expect(validCoordinates(41.9981, 21.4254)).toBe(true);
  });

  it("rejects coordinates outside the world", () => {
    expect(validCoordinates(91, 21)).toBe(false);
    expect(validCoordinates(41, 181)).toBe(false);
  });
});

describe("listingLocationIssues", () => {
  it("accepts a complete address with no area or postcode", () => {
    expect(
      listingLocationIssues(input({ area: "", postalCode: "" }), stored()),
    ).toEqual({});
  });

  it("reports every empty required line at once", () => {
    expect(
      listingLocationIssues(
        input({ address: "", city: "", country: "" }),
        stored(),
      ),
    ).toEqual({ address: "EMPTY", city: "EMPTY", country: "EMPTY" });
  });

  it("counts trimmed text, so whitespace cannot pass a minimum", () => {
    expect(listingLocationIssues(input({ address: "   " }), stored()).address).toBe(
      "EMPTY",
    );
    expect(listingLocationIssues(input({ city: " S " }), stored()).city).toBe(
      "TOO_SHORT",
    );
  });

  it("rejects over-long text rather than truncating it", () => {
    expect(
      listingLocationIssues(input({ postalCode: "1".repeat(21) }), stored())
        .postalCode,
    ).toBe("TOO_LONG");
  });

  it("reports a missing pin when neither the save nor the property has one", () => {
    expect(
      listingLocationIssues(
        input(),
        stored({ latitude: null, longitude: null }),
      ).pin,
    ).toBe("NO_PIN");
  });

  it("accepts a save that supplies the property's first pin", () => {
    const issues = listingLocationIssues(
      input({
        pin: {
          latitude: 41.9981,
          longitude: 21.4254,
          source: "AUTOCOMPLETE",
          provider: "GOOGLE_PLACES",
          placeId: "place-1",
        },
      }),
      stored({ latitude: null, longitude: null }),
    );
    expect(issues.pin).toBeUndefined();
  });
});

describe("listingLocationComplete", () => {
  it("needs both a usable address and a pin", () => {
    expect(listingLocationComplete(stored())).toBe(true);
    expect(
      listingLocationComplete(stored({ latitude: null, longitude: null })),
    ).toBe(false);
    expect(listingLocationComplete(stored({ city: "" }))).toBe(false);
  });
});

describe("mergeGeocodedAddress", () => {
  it("keeps a line the geocoder had nothing to say about", () => {
    const merged = mergeGeocodedAddress(
      {
        address: "Partizanski odredi 15/3",
        city: "Skopje",
        area: "Centar",
        postalCode: "1000",
        country: "North Macedonia",
      },
      { address: "", city: "Skopje", area: "", postalCode: "", country: "North Macedonia" },
    );
    expect(merged.address).toBe("Partizanski odredi 15/3");
    expect(merged.area).toBe("Centar");
    expect(merged.postalCode).toBe("1000");
  });

  it("takes what the geocoder did answer, since it belongs to the new pin", () => {
    const merged = mergeGeocodedAddress(
      {
        address: "Old street 1",
        city: "Skopje",
        area: "Centar",
        postalCode: "1000",
        country: "North Macedonia",
      },
      { address: "Nikola Vapcarov 3", city: "Ohrid", postalCode: "6000" },
    );
    expect(merged).toEqual({
      address: "Nikola Vapcarov 3",
      city: "Ohrid",
      area: "Centar",
      postalCode: "6000",
      country: "North Macedonia",
    });
  });
});

describe("resolveLocationCoordinates", () => {
  it("keeps the stored pin and its geocoding identity when no pin was placed", () => {
    const resolved = resolveLocationCoordinates(null, stored());
    expect(resolved).toEqual({
      latitude: 41.9981,
      longitude: 21.4254,
      locationSource: "AUTOCOMPLETE",
      geocodingProvider: "GOOGLE_PLACES",
      geocodingPlaceId: "place-1",
      moved: false,
    });
  });

  it("ignores a pin that is not a place on Earth", () => {
    const resolved = resolveLocationCoordinates(
      { latitude: 0, longitude: 0, source: "MANUAL_PIN", provider: "", placeId: "" },
      stored(),
    );
    expect(resolved.latitude).toBe(41.9981);
    expect(resolved.moved).toBe(false);
  });

  it("takes a pin the host actually placed, with its provenance", () => {
    const resolved = resolveLocationCoordinates(
      {
        latitude: 41.1231,
        longitude: 20.8016,
        source: "MANUAL_PIN",
        provider: "GEOAPIFY",
        placeId: "place-2",
      },
      stored(),
    );
    expect(resolved).toEqual({
      latitude: 41.1231,
      longitude: 20.8016,
      locationSource: "MANUAL_PIN",
      geocodingProvider: "GEOAPIFY",
      geocodingPlaceId: "place-2",
      moved: true,
    });
  });

  it("does not call a re-pin on the same spot a move", () => {
    const resolved = resolveLocationCoordinates(
      {
        latitude: 41.9981,
        longitude: 21.4254,
        source: "MANUAL_PIN",
        provider: "",
        placeId: "",
      },
      stored(),
    );
    expect(resolved.moved).toBe(false);
  });

  it("normalises an unknown source rather than storing it", () => {
    const resolved = resolveLocationCoordinates(
      {
        latitude: 41.1,
        longitude: 20.8,
        // A stale client, or a direct POST.
        source: "SOMETHING_ELSE" as never,
        provider: "",
        placeId: "",
      },
      stored(),
    );
    expect(resolved.locationSource).toBe("MANUAL_PIN");
  });
});

describe("resolveStreetView", () => {
  const previous = { latitude: 41.9981, longitude: 21.4254 };

  it("clears the angle when the host clears it", () => {
    expect(
      resolveStreetView(
        null,
        stored(),
        { moved: false, latitude: 41.9981, longitude: 21.4254 },
        previous,
      ),
    ).toEqual({
      streetViewHeading: null,
      streetViewPitch: null,
      streetViewPanoId: null,
    });
  });

  it("keeps an untouched angle when the pin did not move", () => {
    expect(
      resolveStreetView(
        { heading: 120, pitch: 5, panoId: "pano-1" },
        stored(),
        { moved: false, latitude: 41.9981, longitude: 21.4254 },
        previous,
      ),
    ).toEqual({
      streetViewHeading: 120,
      streetViewPitch: 5,
      streetViewPanoId: "pano-1",
    });
  });

  it("drops a stale angle when the pin moved to another building", () => {
    expect(
      resolveStreetView(
        { heading: 120, pitch: 5, panoId: "pano-1" },
        stored(),
        { moved: true, latitude: 41.1231, longitude: 20.8016 },
        previous,
      ).streetViewPanoId,
    ).toBeNull();
  });

  it("forgives a nudge of a couple of metres", () => {
    // ~4 m north of the stored pin.
    expect(
      resolveStreetView(
        { heading: 120, pitch: 5, panoId: "pano-1" },
        stored(),
        { moved: true, latitude: 41.99814, longitude: 21.4254 },
        previous,
      ).streetViewPanoId,
    ).toBe("pano-1");
  });

  it("honours an angle the host re-aimed at the new pin", () => {
    expect(
      resolveStreetView(
        { heading: 300, pitch: -2, panoId: "pano-2" },
        stored(),
        { moved: true, latitude: 41.1231, longitude: 20.8016 },
        previous,
      ),
    ).toEqual({
      streetViewHeading: 300,
      streetViewPitch: -2,
      streetViewPanoId: "pano-2",
    });
  });
});

describe("metresBetween", () => {
  it("measures a short hop in metres", () => {
    // 0.001° of latitude is ~111 m anywhere.
    expect(
      metresBetween(
        { latitude: 41.9981, longitude: 21.4254 },
        { latitude: 41.9991, longitude: 21.4254 },
      ),
    ).toBeGreaterThan(105);
    expect(
      metresBetween(
        { latitude: 41.9981, longitude: 21.4254 },
        { latitude: 41.9991, longitude: 21.4254 },
      ),
    ).toBeLessThan(120);
  });
});

describe("planListingLocationSave", () => {
  it("refuses an invalid save before deciding anything else", () => {
    const plan = planListingLocationSave(input({ city: "" }), stored());
    expect(plan).toEqual({ action: "invalid", issues: { city: "EMPTY" } });
  });

  it("reports an untouched form as unchanged", () => {
    expect(planListingLocationSave(input(), stored()).action).toBe("unchanged");
  });

  it("stores a corrected street number without touching the pin", () => {
    const plan = planListingLocationSave(
      input({ address: "Partizanski odredi 15/3" }),
      stored(),
    );
    expect(plan.action).toBe("save");
    if (plan.action !== "save") return;
    expect(plan.write.address).toBe("Partizanski odredi 15/3");
    expect(plan.write.latitude).toBe(41.9981);
    expect(plan.write.longitude).toBe(21.4254);
    expect(plan.write.locationSource).toBe("AUTOCOMPLETE");
    expect(plan.write.geocodingPlaceId).toBe("place-1");
    expect(plan.write.streetViewPanoId).toBe("pano-1");
  });

  it("moves the pin and drops the angle that belonged to the old one", () => {
    const plan = planListingLocationSave(
      input({
        address: "Nikola Vapcarov 3",
        city: "Ohrid",
        pin: {
          latitude: 41.1231,
          longitude: 20.8016,
          source: "AUTOCOMPLETE",
          provider: "GOOGLE_PLACES",
          placeId: "place-2",
        },
      }),
      stored(),
    );
    expect(plan.action).toBe("save");
    if (plan.action !== "save") return;
    expect(plan.write.latitude).toBe(41.1231);
    expect(plan.write.streetViewPanoId).toBeNull();
  });

  it("trims what it stores", () => {
    const plan = planListingLocationSave(
      input({ address: "  Partizanski odredi 15  ", area: "  Karpos  " }),
      stored(),
    );
    if (plan.action !== "save") throw new Error("expected a save");
    expect(plan.write.address).toBe("Partizanski odredi 15");
    expect(plan.write.area).toBe("Karpos");
  });
});

describe("publicLocationChanged", () => {
  const base = stored();

  it("treats a save that leaves the public line alone as private", () => {
    // A corrected street number or postcode changes neither of the two things a guest
    // can see: the "area, city, country" line, and the offset pin drawn from the
    // coordinates. So none of the fields this reads move.
    const corrected = planListingLocationSave(
      input({ address: "Partizanski odredi 15/3", postalCode: "1001" }),
      base,
    );
    if (corrected.action !== "save") throw new Error("expected a save");
    expect(publicLocationChanged(corrected.write, base)).toBe(false);
  });

  it("treats a new city, area, country or pin as public", () => {
    expect(publicLocationChanged({ ...base, city: "Ohrid" }, base)).toBe(true);
    expect(publicLocationChanged({ ...base, area: "Karpos" }, base)).toBe(true);
    expect(publicLocationChanged({ ...base, country: "Albania" }, base)).toBe(true);
    expect(publicLocationChanged({ ...base, latitude: 41.1 }, base)).toBe(true);
  });
});
