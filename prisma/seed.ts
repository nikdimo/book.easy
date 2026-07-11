import { PrismaClient, ListingStatus, BookingStatus, BlockType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.availabilityBlock.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.listingAmenity.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.property.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();

  // ─── Users ──────────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: "dimovski.niko@outlook.com",
      name: "Platform Admin",
      role: "ADMIN",
      isHost: false,
      profile: { create: { bio: "Platform administrator" } },
    },
  });

  const host1 = await prisma.user.create({
    data: {
      email: "elena@example.com",
      name: "Elena Kostadinova",
      role: "USER",
      isHost: true,
      profile: {
        create: {
          phone: "+389 70 123 456",
          bio: "Travel enthusiast and property host in Ohrid.",
          hostBio: "Superhost since 2023. I love sharing the beauty of Lake Ohrid with visitors from around the world.",
          hostDisplayName: "Elena",
        },
      },
    },
  });

  const host2 = await prisma.user.create({
    data: {
      email: "marko@example.com",
      name: "Marko Petrovski",
      role: "USER",
      isHost: true,
      profile: {
        create: {
          phone: "+389 71 987 654",
          bio: "Skopje local with a passion for hospitality.",
          hostBio: "Offering carefully curated stays in the heart of Skopje. Each space is designed for comfort and convenience.",
          hostDisplayName: "Marko",
        },
      },
    },
  });

  const guest1 = await prisma.user.create({
    data: {
      email: "guest@example.com",
      name: "Sarah Johnson",
      role: "USER",
      profile: { create: { bio: "Love exploring the Balkans!" } },
    },
  });

  const guest2 = await prisma.user.create({
    data: {
      email: "traveler@example.com",
      name: "James Wilson",
      role: "USER",
      profile: { create: {} },
    },
  });

  // ─── Amenities ──────────────────────────────────────────────────────────────
  const amenities = await Promise.all([
    prisma.amenity.create({ data: { name: "Wi-Fi", category: "Essentials", icon: "wifi" } }),
    prisma.amenity.create({ data: { name: "Air conditioning", category: "Essentials", icon: "wind" } }),
    prisma.amenity.create({ data: { name: "Heating", category: "Essentials", icon: "thermometer" } }),
    prisma.amenity.create({ data: { name: "Washer", category: "Essentials", icon: "shirt" } }),
    prisma.amenity.create({ data: { name: "Dryer", category: "Essentials", icon: "wind" } }),
    prisma.amenity.create({ data: { name: "TV", category: "Entertainment", icon: "tv" } }),
    prisma.amenity.create({ data: { name: "Kitchen", category: "Kitchen", icon: "cooking-pot" } }),
    prisma.amenity.create({ data: { name: "Refrigerator", category: "Kitchen", icon: "refrigerator" } }),
    prisma.amenity.create({ data: { name: "Microwave", category: "Kitchen", icon: "microwave" } }),
    prisma.amenity.create({ data: { name: "Coffee maker", category: "Kitchen", icon: "coffee" } }),
    prisma.amenity.create({ data: { name: "Balcony", category: "Outdoor", icon: "sun" } }),
    prisma.amenity.create({ data: { name: "Garden", category: "Outdoor", icon: "trees" } }),
    prisma.amenity.create({ data: { name: "Free parking", category: "Features", icon: "car" } }),
    prisma.amenity.create({ data: { name: "Pool", category: "Features", icon: "waves" } }),
    prisma.amenity.create({ data: { name: "Hot tub", category: "Features", icon: "bath" } }),
    prisma.amenity.create({ data: { name: "BBQ grill", category: "Outdoor", icon: "flame" } }),
    prisma.amenity.create({ data: { name: "Smoke detector", category: "Safety", icon: "shield" } }),
    prisma.amenity.create({ data: { name: "First aid kit", category: "Safety", icon: "heart-pulse" } }),
    prisma.amenity.create({ data: { name: "Fire extinguisher", category: "Safety", icon: "fire-extinguisher" } }),
    prisma.amenity.create({ data: { name: "Lake view", category: "Features", icon: "mountain-snow" } }),
    prisma.amenity.create({ data: { name: "City view", category: "Features", icon: "building" } }),
    prisma.amenity.create({ data: { name: "Workspace", category: "Features", icon: "laptop" } }),
    prisma.amenity.create({ data: { name: "Hair dryer", category: "Bathroom", icon: "wind" } }),
    prisma.amenity.create({ data: { name: "Iron", category: "Essentials", icon: "shirt" } }),
  ]);

  const amenityMap = Object.fromEntries(amenities.map((a) => [a.name, a.id]));

  // ─── Properties & Listings (Host 1 - Elena in Ohrid) ─────────────────────

  const prop1 = await prisma.property.create({
    data: {
      ownerId: host1.id,
      name: "Lakeside Villa Ohrid",
      propertyType: "VILLA",
      address: "ul. Kej Maršal Tito 25",
      city: "Ohrid",
      area: "Old Town",
      country: "North Macedonia",
      latitude: 41.1131,
      longitude: 20.8016,
    },
  });

  const listing1 = await prisma.listing.create({
    data: {
      propertyId: prop1.id,
      hostId: host1.id,
      title: "Charming Lakeside Villa with Panoramic Views",
      slug: "charming-lakeside-villa-ohrid",
      description: "Wake up to breathtaking views of Lake Ohrid from this beautifully restored villa in the historic Old Town. The villa features traditional Macedonian architecture with modern amenities, a private garden with direct lake access, and is just steps away from the ancient churches and vibrant waterfront promenade.\n\nThe space is perfect for families or groups looking for an authentic Ohrid experience. Enjoy morning coffee on the terrace overlooking the crystal-clear lake, explore the UNESCO World Heritage old town, or simply relax in the peaceful garden.",
      status: ListingStatus.APPROVED,
      maxGuests: 6,
      bedrooms: 3,
      bathrooms: 2,
      beds: 4,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  await prisma.listingImage.createMany({
    data: [
      { listingId: listing1.id, url: "https://picsum.photos/seed/bookeasy-l1-a/1200/800", alt: "Villa exterior with lake view", displayOrder: 0, isPrimary: true },
      { listingId: listing1.id, url: "https://picsum.photos/seed/bookeasy-l1-b/1200/800", alt: "Living room", displayOrder: 1 },
      { listingId: listing1.id, url: "https://picsum.photos/seed/bookeasy-l1-c/1200/800", alt: "Master bedroom", displayOrder: 2 },
      { listingId: listing1.id, url: "https://picsum.photos/seed/bookeasy-l1-d/1200/800", alt: "Lake view from terrace", displayOrder: 3 },
      { listingId: listing1.id, url: "https://picsum.photos/seed/bookeasy-l1-e/1200/800", alt: "Garden", displayOrder: 4 },
    ],
  });

  await prisma.pricingRule.create({
    data: { listingId: listing1.id, baseNightlyRate: 120, cleaningFee: 35, minNights: 2 },
  });

  await prisma.listingAmenity.createMany({
    data: ["Wi-Fi", "Air conditioning", "Kitchen", "Lake view", "Garden", "Free parking", "Washer", "TV", "Balcony", "Coffee maker", "Smoke detector", "First aid kit"]
      .map((name) => ({ listingId: listing1.id, amenityId: amenityMap[name] })),
  });

  // Listing 2 - Elena's apartment
  const prop2 = await prisma.property.create({
    data: {
      ownerId: host1.id,
      name: "Ohrid Studio",
      propertyType: "STUDIO",
      address: "ul. Car Samoil 14",
      city: "Ohrid",
      area: "Center",
      country: "North Macedonia",
      latitude: 41.1117,
      longitude: 20.8019,
    },
  });

  const listing2 = await prisma.listing.create({
    data: {
      propertyId: prop2.id,
      hostId: host1.id,
      title: "Modern Studio in the Heart of Ohrid",
      slug: "modern-studio-heart-ohrid",
      description: "A cozy and modern studio apartment in the center of Ohrid, perfect for couples or solo travelers. Recently renovated with contemporary design, full kitchen, and a comfortable workspace. Walk to the lake, old bazaar, and all major attractions within minutes.\n\nThe studio has everything you need for a comfortable stay, including high-speed Wi-Fi for remote workers and a fully equipped kitchenette.",
      status: ListingStatus.APPROVED,
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      beds: 1,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  await prisma.listingImage.createMany({
    data: [
      { listingId: listing2.id, url: "https://picsum.photos/seed/bookeasy-l2-a/1200/800", alt: "Studio interior", displayOrder: 0, isPrimary: true },
      { listingId: listing2.id, url: "https://picsum.photos/seed/bookeasy-l2-b/1200/800", alt: "Kitchen area", displayOrder: 1 },
      { listingId: listing2.id, url: "https://picsum.photos/seed/bookeasy-l2-c/1200/800", alt: "Bathroom", displayOrder: 2 },
    ],
  });

  await prisma.pricingRule.create({
    data: { listingId: listing2.id, baseNightlyRate: 45, cleaningFee: 15, minNights: 1 },
  });

  await prisma.listingAmenity.createMany({
    data: ["Wi-Fi", "Air conditioning", "Kitchen", "Workspace", "Washer", "TV", "Coffee maker", "Hair dryer", "Heating"]
      .map((name) => ({ listingId: listing2.id, amenityId: amenityMap[name] })),
  });

  // Listing 3 - Elena's draft listing
  const prop3 = await prisma.property.create({
    data: {
      ownerId: host1.id,
      name: "Ohrid Beach House",
      propertyType: "HOUSE",
      address: "ul. Turistička bb",
      city: "Ohrid",
      area: "Kaneo",
      country: "North Macedonia",
    },
  });

  await prisma.listing.create({
    data: {
      propertyId: prop3.id,
      hostId: host1.id,
      title: "Beach House near Kaneo",
      slug: "beach-house-kaneo-ohrid",
      description: "A new beach house near the famous Kaneo church. Coming soon!",
      status: ListingStatus.DRAFT,
      maxGuests: 8,
      bedrooms: 4,
      bathrooms: 3,
      beds: 5,
    },
  });

  // ─── Properties & Listings (Host 2 - Marko in Skopje) ────────────────────

  const prop4 = await prisma.property.create({
    data: {
      ownerId: host2.id,
      name: "Skopje Penthouse",
      propertyType: "APARTMENT",
      address: "bul. Partizanski Odredi 42",
      city: "Skopje",
      area: "City Center",
      country: "North Macedonia",
      latitude: 41.9981,
      longitude: 21.4254,
    },
  });

  const listing4 = await prisma.listing.create({
    data: {
      propertyId: prop4.id,
      hostId: host2.id,
      title: "Luxury Penthouse with Vodno Mountain Views",
      slug: "luxury-penthouse-skopje-vodno",
      description: "Experience Skopje from above in this stunning penthouse apartment with floor-to-ceiling windows offering panoramic views of Vodno Mountain and the city skyline. The apartment features premium finishes, a spacious open-plan living area, and a private rooftop terrace.\n\nLocated in the heart of the city, you are minutes from the Old Bazaar, Stone Bridge, and Macedonia Square. Perfect for business travelers and couples seeking a premium urban retreat.",
      status: ListingStatus.APPROVED,
      maxGuests: 4,
      bedrooms: 2,
      bathrooms: 2,
      beds: 2,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  await prisma.listingImage.createMany({
    data: [
      { listingId: listing4.id, url: "https://picsum.photos/seed/bookeasy-l4-a/1200/800", alt: "Penthouse living room", displayOrder: 0, isPrimary: true },
      { listingId: listing4.id, url: "https://picsum.photos/seed/bookeasy-l4-b/1200/800", alt: "Mountain view from terrace", displayOrder: 1 },
      { listingId: listing4.id, url: "https://picsum.photos/seed/bookeasy-l4-c/1200/800", alt: "Master bedroom", displayOrder: 2 },
      { listingId: listing4.id, url: "https://picsum.photos/seed/bookeasy-l4-d/1200/800", alt: "Modern kitchen", displayOrder: 3 },
    ],
  });

  await prisma.pricingRule.create({
    data: { listingId: listing4.id, baseNightlyRate: 95, cleaningFee: 25, minNights: 1 },
  });

  await prisma.listingAmenity.createMany({
    data: ["Wi-Fi", "Air conditioning", "Heating", "Kitchen", "City view", "TV", "Workspace", "Washer", "Dryer", "Coffee maker", "Hair dryer", "Iron", "Balcony", "Free parking"]
      .map((name) => ({ listingId: listing4.id, amenityId: amenityMap[name] })),
  });

  // Listing 5 - Marko's cozy apartment
  const prop5 = await prisma.property.create({
    data: {
      ownerId: host2.id,
      name: "Old Bazaar Apartment",
      propertyType: "APARTMENT",
      address: "ul. Bitpazarska 8",
      city: "Skopje",
      area: "Old Bazaar",
      country: "North Macedonia",
      latitude: 42.0005,
      longitude: 21.4360,
    },
  });

  const listing5 = await prisma.listing.create({
    data: {
      propertyId: prop5.id,
      hostId: host2.id,
      title: "Cozy Apartment in the Historic Old Bazaar",
      slug: "cozy-apartment-old-bazaar-skopje",
      description: "Step into history with this charming apartment located within the Old Bazaar of Skopje, one of the oldest and largest marketplaces in the Balkans. The apartment blends traditional charm with modern comfort, featuring exposed stone walls, warm wooden accents, and contemporary amenities.\n\nExplore centuries-old mosques, hammams, and artisan shops right outside your door. The vibrant nightlife and restaurants of Debar Maalo are just a short walk away.",
      status: ListingStatus.APPROVED,
      maxGuests: 3,
      bedrooms: 1,
      bathrooms: 1,
      beds: 2,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  await prisma.listingImage.createMany({
    data: [
      { listingId: listing5.id, url: "https://picsum.photos/seed/bookeasy-l5-a/1200/800", alt: "Apartment living area", displayOrder: 0, isPrimary: true },
      { listingId: listing5.id, url: "https://picsum.photos/seed/bookeasy-l5-b/1200/800", alt: "Bedroom", displayOrder: 1 },
      { listingId: listing5.id, url: "https://picsum.photos/seed/bookeasy-l5-c/1200/800", alt: "Kitchen", displayOrder: 2 },
    ],
  });

  await prisma.pricingRule.create({
    data: { listingId: listing5.id, baseNightlyRate: 55, cleaningFee: 20, minNights: 1 },
  });

  await prisma.listingAmenity.createMany({
    data: ["Wi-Fi", "Heating", "Air conditioning", "Kitchen", "TV", "Coffee maker", "Washer", "Hair dryer", "Smoke detector"]
      .map((name) => ({ listingId: listing5.id, amenityId: amenityMap[name] })),
  });

  // Listing 6 - Marko's cabin (pending review)
  const prop6 = await prisma.property.create({
    data: {
      ownerId: host2.id,
      name: "Mavrovo Cabin",
      propertyType: "CABIN",
      address: "Mavrovo Village",
      city: "Mavrovo",
      area: "National Park",
      country: "North Macedonia",
    },
  });

  const listing6 = await prisma.listing.create({
    data: {
      propertyId: prop6.id,
      hostId: host2.id,
      title: "Mountain Retreat Cabin in Mavrovo National Park",
      slug: "mountain-retreat-cabin-mavrovo",
      description: "Escape to the mountains in this cozy cabin surrounded by the pristine nature of Mavrovo National Park. Perfect for skiing in winter and hiking in summer. Features a fireplace, wooden terrace, and stunning mountain views.",
      status: ListingStatus.PENDING_REVIEW,
      maxGuests: 5,
      bedrooms: 2,
      bathrooms: 1,
      beds: 3,
    },
  });

  await prisma.listingImage.createMany({
    data: [
      { listingId: listing6.id, url: "https://picsum.photos/seed/bookeasy-l6-a/1200/800", alt: "Cabin exterior", displayOrder: 0, isPrimary: true },
      { listingId: listing6.id, url: "https://picsum.photos/seed/bookeasy-l6-b/1200/800", alt: "Interior with fireplace", displayOrder: 1 },
    ],
  });

  await prisma.pricingRule.create({
    data: { listingId: listing6.id, baseNightlyRate: 70, cleaningFee: 20, minNights: 2 },
  });

  await prisma.listingAmenity.createMany({
    data: ["Wi-Fi", "Heating", "Kitchen", "Free parking", "Garden", "BBQ grill", "Smoke detector", "First aid kit"]
      .map((name) => ({ listingId: listing6.id, amenityId: amenityMap[name] })),
  });

  // Listing 7 - Another approved one for variety
  const prop7 = await prisma.property.create({
    data: {
      ownerId: host1.id,
      name: "Bitola Heritage House",
      propertyType: "HOUSE",
      address: "ul. Širok Sokak 15",
      city: "Bitola",
      area: "Center",
      country: "North Macedonia",
      latitude: 41.0297,
      longitude: 21.3292,
    },
  });

  const listing7 = await prisma.listing.create({
    data: {
      propertyId: prop7.id,
      hostId: host1.id,
      title: "Elegant Heritage House on Širok Sokak",
      slug: "elegant-heritage-house-bitola",
      description: "Stay in a beautifully restored 19th-century heritage house on Bitola's famous pedestrian street, Širok Sokak. The house preserves its original Ottoman-era architecture while offering all modern comforts. High ceilings, ornate woodwork, and a private courtyard create a unique atmosphere.\n\nBitola, the \"City of Consuls\", offers a rich blend of history, culture, and cuisine. Visit the ancient city of Heraclea Lyncestis just outside town.",
      status: ListingStatus.APPROVED,
      maxGuests: 5,
      bedrooms: 2,
      bathrooms: 2,
      beds: 3,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  await prisma.listingImage.createMany({
    data: [
      { listingId: listing7.id, url: "https://picsum.photos/seed/bookeasy-l7-a/1200/800", alt: "House facade", displayOrder: 0, isPrimary: true },
      { listingId: listing7.id, url: "https://picsum.photos/seed/bookeasy-l7-b/1200/800", alt: "Living room", displayOrder: 1 },
      { listingId: listing7.id, url: "https://picsum.photos/seed/bookeasy-l7-c/1200/800", alt: "Courtyard", displayOrder: 2 },
    ],
  });

  await prisma.pricingRule.create({
    data: { listingId: listing7.id, baseNightlyRate: 75, cleaningFee: 20, minNights: 2 },
  });

  await prisma.listingAmenity.createMany({
    data: ["Wi-Fi", "Heating", "Air conditioning", "Kitchen", "Garden", "Washer", "TV", "Coffee maker", "Iron", "Smoke detector"]
      .map((name) => ({ listingId: listing7.id, amenityId: amenityMap[name] })),
  });

  // ─── Bookings ───────────────────────────────────────────────────────────────

  const booking1 = await prisma.booking.create({
    data: {
      listingId: listing1.id,
      guestId: guest1.id,
      checkIn: new Date("2026-05-15"),
      checkOut: new Date("2026-05-20"),
      guestCount: 4,
      nightlyRate: 120,
      cleaningFee: 35,
      serviceFee: 0,
      totalPrice: 635,
      numberOfNights: 5,
      status: BookingStatus.CONFIRMED,
      guestNote: "We are a family of 4 visiting Ohrid for the first time. Very excited!",
    },
  });

  await prisma.availabilityBlock.create({
    data: {
      listingId: listing1.id,
      startDate: new Date("2026-05-15"),
      endDate: new Date("2026-05-20"),
      blockType: BlockType.BOOKING_HOLD,
      bookingId: booking1.id,
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      listingId: listing4.id,
      guestId: guest2.id,
      checkIn: new Date("2026-04-10"),
      checkOut: new Date("2026-04-14"),
      guestCount: 2,
      nightlyRate: 95,
      cleaningFee: 25,
      serviceFee: 0,
      totalPrice: 405,
      numberOfNights: 4,
      status: BookingStatus.PENDING,
      guestNote: "Business trip to Skopje. Would appreciate early check-in if possible.",
    },
  });

  await prisma.availabilityBlock.create({
    data: {
      listingId: listing4.id,
      startDate: new Date("2026-04-10"),
      endDate: new Date("2026-04-14"),
      blockType: BlockType.BOOKING_HOLD,
      bookingId: booking2.id,
    },
  });

  await prisma.booking.create({
    data: {
      listingId: listing2.id,
      guestId: guest1.id,
      checkIn: new Date("2026-03-01"),
      checkOut: new Date("2026-03-05"),
      guestCount: 2,
      nightlyRate: 45,
      cleaningFee: 15,
      serviceFee: 0,
      totalPrice: 195,
      numberOfNights: 4,
      status: BookingStatus.COMPLETED,
    },
  });

  await prisma.booking.create({
    data: {
      listingId: listing5.id,
      guestId: guest2.id,
      checkIn: new Date("2026-02-10"),
      checkOut: new Date("2026-02-13"),
      guestCount: 2,
      nightlyRate: 55,
      cleaningFee: 20,
      serviceFee: 0,
      totalPrice: 185,
      numberOfNights: 3,
      status: BookingStatus.CANCELLED_BY_GUEST,
      cancellationReason: "Change of travel plans",
    },
  });

  // Manual blocks
  await prisma.availabilityBlock.create({
    data: {
      listingId: listing1.id,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-10"),
      blockType: BlockType.MANUAL_BLOCK,
      reason: "Personal use - family vacation",
    },
  });

  await prisma.availabilityBlock.create({
    data: {
      listingId: listing4.id,
      startDate: new Date("2026-04-25"),
      endDate: new Date("2026-04-30"),
      blockType: BlockType.MANUAL_BLOCK,
      reason: "Maintenance and cleaning",
    },
  });

  // ─── Audit Log ──────────────────────────────────────────────────────────────

  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: "listing.approve",
        entityType: "Listing",
        entityId: listing1.id,
        metadata: { listingTitle: listing1.title },
      },
      {
        userId: admin.id,
        action: "listing.approve",
        entityType: "Listing",
        entityId: listing2.id,
        metadata: { listingTitle: listing2.title },
      },
      {
        userId: admin.id,
        action: "listing.approve",
        entityType: "Listing",
        entityId: listing4.id,
        metadata: { listingTitle: listing4.title },
      },
      {
        userId: admin.id,
        action: "listing.approve",
        entityType: "Listing",
        entityId: listing5.id,
        metadata: { listingTitle: listing5.title },
      },
      {
        userId: admin.id,
        action: "booking.confirm",
        entityType: "Booking",
        entityId: booking1.id,
        metadata: { listingTitle: listing1.title, guestName: guest1.name },
      },
    ],
  });

  console.log("Seed completed successfully!");
  console.log("──────────────────────────────────────");
  console.log("Test accounts (sign in with Google or a magic link to these emails):");
  console.log("  Admin:  dimovski.niko@outlook.com");
  console.log("  Host 1: elena@example.com");
  console.log("  Host 2: marko@example.com");
  console.log("  Guest:  guest@example.com");
  console.log("──────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
