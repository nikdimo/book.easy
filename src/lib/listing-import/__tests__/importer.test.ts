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
      currency: "DKK",
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
});
