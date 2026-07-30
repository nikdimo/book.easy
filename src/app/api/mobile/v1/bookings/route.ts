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
      reference: booking.reference,
      listingId: booking.listingId,
      listingTitle: booking.listing.title,
      imageUrl: booking.listing.images[0]?.url ?? null,
      city: booking.listing.property.city,
      guestName: booking.guest.name,
      guestCount: booking.guestCount,
      guestNote: booking.guestNote,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      totalPrice: Number(booking.totalPrice),
      status: booking.status,
      responseDueAt: booking.responseDueAt.toISOString(),
      cancellationReason: booking.cancellationReason,
      createdAt: booking.createdAt.toISOString(),
    })),
  });
}
