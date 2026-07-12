import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const accounts = [
  { email: "qa.admin@book.easy.test", name: "Mobile QA Admin", role: "ADMIN" as const, isHost: false },
  { email: "qa.host@book.easy.test", name: "Mobile QA Host", role: "USER" as const, isHost: true },
  { email: "qa.guest@book.easy.test", name: "Mobile QA Guest", role: "USER" as const, isHost: false },
];

async function main() {
  const [admin, host, guest] = await Promise.all(
    accounts.map((account) =>
      prisma.user.upsert({
        where: { email: account.email },
        update: { name: account.name, role: account.role, isHost: account.isHost, isActive: true },
        create: {
          ...account,
          emailVerified: new Date(),
          profile: { create: { bio: "Local mobile QA account" } },
        },
      })
    )
  );

  let property = await prisma.property.findFirst({
    where: { ownerId: host.id, name: "Mobile QA Apartment" },
  });
  property ??= await prisma.property.create({
    data: {
      ownerId: host.id,
      name: "Mobile QA Apartment",
      propertyType: "APARTMENT",
      address: "QA Test Street 1",
      city: "Ohrid",
      area: "Center",
      country: "North Macedonia",
      latitude: 41.1131,
      longitude: 20.8016,
    },
  });

  const listing = await prisma.listing.upsert({
    where: { slug: "mobile-qa-apartment" },
    update: { hostId: host.id, propertyId: property.id },
    create: {
      hostId: host.id,
      propertyId: property.id,
      title: "Mobile QA Apartment with a Deliberately Long Listing Title",
      slug: "mobile-qa-apartment",
      description: "A local-only listing used to verify responsive layouts, long text wrapping, galleries, booking cards, and host controls.",
      status: "APPROVED",
      maxGuests: 4,
      bedrooms: 2,
      bathrooms: 1,
      beds: 3,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  await prisma.pricingRule.upsert({
    where: { listingId: listing.id },
    update: { baseNightlyRate: 80, cleaningFee: 20, minNights: 1 },
    create: { listingId: listing.id, baseNightlyRate: 80, cleaningFee: 20, minNights: 1 },
  });

  if ((await prisma.listingImage.count({ where: { listingId: listing.id } })) === 0) {
    await prisma.listingImage.createMany({
      data: [
        { listingId: listing.id, url: "https://picsum.photos/seed/mobile-qa-portrait/800/1200", alt: "Portrait QA photo", displayOrder: 0, isPrimary: true },
        { listingId: listing.id, url: "https://picsum.photos/seed/mobile-qa-wide/1200/700", alt: "Wide QA photo", displayOrder: 1 },
        { listingId: listing.id, url: "https://picsum.photos/seed/mobile-qa-square/900/900", alt: "Square QA photo", displayOrder: 2 },
      ],
    });
  }

  let booking = await prisma.booking.findFirst({
    where: { listingId: listing.id, guestId: guest.id },
  });
  booking ??= await prisma.booking.create({
    data: {
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2026-08-15T00:00:00.000Z"),
      checkOut: new Date("2026-08-18T00:00:00.000Z"),
      guestCount: 3,
      nightlyRate: 80,
      cleaningFee: 20,
      serviceFee: 0,
      totalPrice: 260,
      numberOfNights: 3,
      status: "PENDING",
      guestNote: "Mobile QA booking with enough text to verify wrapping on narrow screens.",
    },
  });

  const secret = process.env.AUTH_SECRET ?? "dev-only-auth-secret-not-for-production";
  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";

  console.log("Local QA accounts are ready:");
  for (const user of [admin, host, guest]) {
    const token = randomBytes(32).toString("hex");
    const hashedToken = createHash("sha256").update(`${token}${secret}`).digest("hex");
    await prisma.verificationToken.deleteMany({ where: { identifier: user.email } });
    await prisma.verificationToken.create({
      data: { identifier: user.email, token: hashedToken, expires: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const params = new URLSearchParams({ callbackUrl: "/", token, email: user.email });
    console.log(`${user.email}: ${baseUrl}/api/auth/callback/nodemailer?${params}`);
  }
  console.log(`QA listing: ${listing.id}`);
  console.log(`QA booking: ${booking.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
