import { getHostBookings } from "@/lib/services/listing.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const bookings = await getHostBookings(access.user.id);
  return mobileJson(request, {
    bookings: bookings.map((booking) => ({
      id: booking.id,
      listingId: booking.listingId,
      listingTitle: booking.listing.title,
      city: booking.listing.property.city,
      guestName: booking.guest.name,
      guestEmail: booking.guest.email,
      guestCount: booking.guestCount,
      guestNote: booking.guestNote,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      totalPrice: Number(booking.totalPrice),
      status: booking.status,
      cancellationReason: booking.cancellationReason,
      createdAt: booking.createdAt.toISOString(),
    })),
  });
}
