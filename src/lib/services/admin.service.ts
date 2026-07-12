import "server-only";
import { db } from "@/lib/db";
import { completePastBookings } from "@/lib/services/booking.service";

export async function getAdminDashboardStats() {
  await completePastBookings();
  const [
    totalUsers,
    totalHosts,
    totalListings,
    pendingListings,
    approvedListings,
    totalBookings,
    pendingBookings,
    confirmedBookings,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isHost: true } }),
    db.listing.count(),
    db.listing.count({ where: { needsReview: true } }),
    db.listing.count({ where: { status: "APPROVED" } }),
    db.booking.count(),
    db.booking.count({ where: { status: "PENDING" } }),
    db.booking.count({ where: { status: "CONFIRMED" } }),
  ]);

  return {
    totalUsers,
    totalHosts,
    totalListings,
    pendingListings,
    approvedListings,
    totalBookings,
    pendingBookings,
    confirmedBookings,
  };
}

export async function getAllUsersForAdmin() {
  return db.user.findMany({
    include: {
      _count: { select: { bookings: true, listings: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllBookingsForAdmin() {
  await completePastBookings();
  return db.booking.findMany({
    include: {
      listing: { include: { property: { select: { city: true } } } },
      guest: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllListingsForAdmin() {
  return db.listing.findMany({
    include: {
      property: { select: { city: true } },
      host: { select: { name: true, email: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getListingForAdminReview(id: string) {
  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      property: true,
      host: { include: { profile: true } },
      images: { orderBy: { displayOrder: "asc" } },
      pricingRule: true,
      amenities: { include: { amenity: true } },
      _count: { select: { bookings: true } },
    },
  });

  if (!listing) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [availabilityBlocks, datePrices] = await Promise.all([
    db.availabilityBlock.findMany({
      where: { listingId: listing.id, endDate: { gte: today } },
      include: {
        booking: { select: { id: true, guest: { select: { name: true } }, status: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    db.listingDatePrice.findMany({
      where: { listingId: listing.id, date: { gte: today } },
      orderBy: { date: "asc" },
    }),
  ]);

  return { listing, availabilityBlocks, datePrices };
}

export async function getSuggestionsForAdmin() {
  const suggestions = await db.suggestion.findMany({
    include: {
      host: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true } },
      listing: { select: { id: true, title: true, slug: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return {
    pending: suggestions.filter((s) => s.status === "PENDING"),
    reviewed: suggestions.filter((s) => s.status !== "PENDING"),
  };
}

export async function getReportsForAdmin() {
  const reports = await db.listingReport.findMany({
    include: {
      listing: { select: { id: true, title: true, slug: true, status: true } },
      reporter: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return {
    pending: reports.filter((r) => r.status === "PENDING"),
    reviewed: reports.filter((r) => r.status !== "PENDING"),
  };
}

export async function getAuditLogs(limit = 100) {
  return db.auditLog.findMany({
    include: {
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
