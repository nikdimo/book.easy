import { describe, expect, it } from "vitest";
import { parseListingHtml } from "@/lib/listing-import/importer";
import { providerForUrl } from "@/lib/listing-import/provider";

describe("listing link providers", () => {
  it("specializes known hosts and safely classifies other public HTTPS links", () => {
    expect(providerForUrl("https://www.airbnb.com/rooms/123")).toBe("AIRBNB");
    expect(providerForUrl("https://secure.booking.com/hotel/mk/example.html")).toBe("BOOKING");
    expect(providerForUrl("https://www.vrbo.co.uk/p123")).toBe("VRBO");
    expect(providerForUrl("https://airbnb.com.example.test/rooms/123")).toBe("GENERIC");
    expect(providerForUrl("https://independent-hotel.example/rooms/sea-view")).toBe("GENERIC");
    expect(providerForUrl("http://www.airbnb.com/rooms/123")).toBeNull();
    expect(providerForUrl("https://localhost/property/123")).toBeNull();
    expect(providerForUrl("https://user:secret@example.com/property/123")).toBeNull();
  });
});

describe("public listing metadata parser", () => {
  it("conservatively imports Open Graph data from an unknown public website", () => {
    const result = parseListingHtml(
      `<html><head>
        <meta property="og:title" content="Harbour guest room">
        <meta property="og:description" content="A private room near the harbour.">
        <meta property="og:image" content="https://images.example/harbour.jpg">
      </head></html>`,
      "https://independent-host.example/harbour-room",
      "GENERIC",
    );
    expect(result).toMatchObject({
      provider: "GENERIC",
      title: "Harbour guest room",
      description: "A private room near the harbour.",
      amenities: [],
      imageUrls: ["https://images.example/harbour.jpg"],
    });
    expect(result.nightlyRate).toBeUndefined();
  });

  it("combines structured listing data with Open Graph photos", () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://images.example/second.jpg">
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "VacationRental",
            "name": "Lake House &amp; Garden",
            "description": "A quiet home beside the lake with room for everyone.",
            "image": ["https://images.example/first.jpg"],
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "1 Lake Road",
              "addressLocality": "Ohrid",
              "addressRegion": "Old Town",
              "postalCode": "6000",
              "addressCountry": { "name": "North Macedonia" }
            },
            "geo": { "latitude": 41.12, "longitude": 20.8 },
            "occupancy": { "maxValue": 6 },
            "numberOfBedrooms": 3,
            "numberOfBeds": 4,
            "numberOfBathroomsTotal": 2,
            "amenityFeature": [
              { "name": "WiFi", "value": true },
              { "name": "Lake view", "value": true },
              { "name": "Unavailable feature", "value": false }
            ],
            "offers": { "price": "120", "priceCurrency": "EUR", "unitText": "NIGHT" }
          }
        </script>
      </head></html>`;

    const result = parseListingHtml(
      html,
      "https://www.vrbo.com/p123",
      "VRBO",
    );

    expect(result).toMatchObject({
      provider: "VRBO",
      title: "Lake House & Garden",
      city: "Ohrid",
      country: "North Macedonia",
      latitude: 41.12,
      maxGuests: 6,
      bedrooms: 3,
      beds: 4,
      bathrooms: 2,
      currency: "EUR",
      nightlyRate: 120,
      amenities: ["WiFi", "Lake view"],
    });
    expect(result.imageUrls).toEqual([
      "https://images.example/first.jpg",
      "https://images.example/second.jpg",
    ]);
  });

  it("does not guess that a schema offer is nightly without a unit", () => {
    const result = parseListingHtml(
      `<script type="application/ld+json">{
        "@type":"Hotel","name":"Test Hotel",
        "offers":{"price":"900","priceCurrency":"EUR"}
      }</script>`,
      "https://www.booking.com/hotel/test.html",
      "BOOKING",
    );
    expect(result.nightlyRate).toBeUndefined();
  });

  it("merges Airbnb's provider payload with its public JSON-LD", () => {
    const html = `
      <meta property="og:title" content="Home in Roskilde · ★4.89 · 1 bedroom · 3 beds · 1 private bath">
      <script>{"serverDeterminedCurrency":"DKK"}</script>
      <script type="application/ld+json">{
        "@type":"VacationRental",
        "name":"Bright room",
        "description":"A bright private room.",
        "image":["https://images.example/1.jpg","https://images.example/2.jpg"],
        "latitude":55.634,
        "longitude":12.0936,
        "address":{"addressLocality":"Roskilde"}
      }</script>
      <script id="data-deferred-state-0" type="application/json">${JSON.stringify({
        sections: [
          { __typename: "AmenityItem", available: true, title: "Wifi" },
          { __typename: "AmenityItem", available: true, title: "Free parking on premises" },
          { __typename: "AmenityItem", available: false, title: "Carbon monoxide alarm" },
        ],
        eventData: {
          __typename: "PdpEventData",
          listingLat: 55.634,
          listingLng: 12.0936,
          roomType: "Private room",
          personCapacity: 4,
          propertyType: "HOUSE",
        },
        embedData: { propertyType: "Private room in home" },
        labels: [
          "Room in Roskilde, Denmark",
          "Check-in after 3:00 PM",
          "Checkout before 11:00 AM",
          "2 nights x €85.56",
          "€200.58",
          "€171.12",
          "The host recently lowered the price for these dates.",
        ],
      })}</script>`;

    const result = parseListingHtml(
      html,
      "https://www.airbnb.com/rooms/1716148263083007294",
      "AIRBNB",
    );

    expect(result).toMatchObject({
      propertyType: "HOUSE",
      spaceType: "Private room",
      city: "Roskilde",
      country: "Denmark",
      latitude: 55.634,
      longitude: 12.0936,
      locationApproximate: true,
      maxGuests: 4,
      bedrooms: 1,
      beds: 3,
      bathrooms: 1,
      // The page declares DKK, but every amount on it is quoted in euros. The rate and
      // its label are read off the same string and must agree — a listing seeded at
      // 100.29 *kroner* because of a header would be off by a factor of seven.
      currency: "EUR",
      nightlyRate: 100.29,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      amenities: ["Wifi", "Free parking on premises"],
      priceQuote: {
        checkIn: undefined,
        checkOut: undefined,
        nights: 2,
        currency: "EUR",
        originalNightlyRate: 100.29,
        currentNightlyRate: 85.56,
        originalTotal: 200.58,
        currentTotal: 171.12,
      },
    });
    expect(result.imageUrls).toHaveLength(2);
  });

  it("reads the address and rate off a dateless hotel listing", () => {
    // What a plain shared link looks like: no dates, so no stay quote and no night-count
    // line — and a hotel-shaped listing, whose heading names a kind the location parser
    // used to skip straight past.
    const html = `
      <meta property="og:title" content="Suite in Skopje · ★4.7 · 1 bedroom · 2 beds · 1 bath">
      <script>{"serverDeterminedCurrency":"MKD"}</script>
      <script id="data-deferred-state-0" type="application/json">${JSON.stringify({
        eventData: { roomType: "Private room", personCapacity: 2, propertyType: "HOTEL" },
        map: { lat: 41.9981, lng: 21.4254 },
        price: { qualifier: "per night", price: "MKD 5,200" },
        labels: ["Suite in Skopje, North Macedonia", "Show all photos"],
      })}</script>`;

    const result = parseListingHtml(html, "https://www.airbnb.com/rooms/42", "AIRBNB");

    expect(result).toMatchObject({
      propertyType: "HOTEL",
      city: "Skopje",
      country: "North Macedonia",
      // The reverse geocode that fills the rest of the Address step needs a pin, and this
      // payload states one under a key that is not the listing's own.
      latitude: 41.9981,
      longitude: 21.4254,
      currency: "MKD",
      // Not 5.2: the separator groups thousands here, it is not a decimal point.
      nightlyRate: 5200,
    });
    expect(result.priceQuote).toBeUndefined();
  });

  it("reads a nightly rate stated only in the page's own text", () => {
    const html = `
      <script>{"serverDeterminedCurrency":"EUR"}</script>
      <script id="data-deferred-state-0" type="application/json">${JSON.stringify({
        labels: ["€85 per night", "Rental unit in Ohrid, North Macedonia", "€425 total"],
      })}</script>`;

    const result = parseListingHtml(html, "https://www.airbnb.com/rooms/7", "AIRBNB");

    expect(result.nightlyRate).toBe(85);
    expect(result.city).toBe("Ohrid");
  });

  it("does not mistake a stay total or a night count for a nightly rate", () => {
    const html = `
      <script>{"serverDeterminedCurrency":"EUR"}</script>
      <script id="data-deferred-state-0" type="application/json">${JSON.stringify({
        labels: ["€425 for 5 nights", "5 nights", "Reserve"],
      })}</script>`;

    expect(
      parseListingHtml(html, "https://www.airbnb.com/rooms/8", "AIRBNB").nightlyRate,
    ).toBeUndefined();
  });

  it("keeps a pin off the null island out of the import", () => {
    const html = `
      <script id="data-deferred-state-0" type="application/json">${JSON.stringify({
        eventData: { personCapacity: 2 },
        map: { lat: 0, lng: 0 },
      })}</script>`;

    const result = parseListingHtml(html, "https://www.airbnb.com/rooms/9", "AIRBNB");

    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
  });
});
