import { describe, expect, it } from "vitest";
import { parseListingHtml, providerForUrl } from "@/lib/listing-import/importer";

describe("listing link providers", () => {
  it("accepts supported provider hosts and rejects lookalikes", () => {
    expect(providerForUrl("https://www.airbnb.com/rooms/123")).toBe("AIRBNB");
    expect(providerForUrl("https://secure.booking.com/hotel/mk/example.html")).toBe("BOOKING");
    expect(providerForUrl("https://www.vrbo.co.uk/p123")).toBe("VRBO");
    expect(providerForUrl("https://airbnb.com.example.test/rooms/123")).toBeNull();
    expect(providerForUrl("http://www.airbnb.com/rooms/123")).toBeNull();
  });
});

describe("public listing metadata parser", () => {
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
});

