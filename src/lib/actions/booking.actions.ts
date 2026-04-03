"use server";

import { auth } from "@/lib/auth";
import { createBookingSchema } from "@/lib/validations/booking.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";
import { createBooking, cancelBooking } from "@/lib/services/booking.service";
import { redirect } from "next/navigation";

export async function createBookingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be logged in to book" };
  }

  const raw = {
    listingId: formData.get("listingId") as string,
    checkIn: formData.get("checkIn") as string,
    checkOut: formData.get("checkOut") as string,
    guestCount: formData.get("guestCount") as string,
    guestNote: (formData.get("guestNote") as string) || undefined,
  };

  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  try {
    const booking = await createBooking({
      listingId: parsed.data.listingId,
      guestId: session.user.id,
      checkIn: new Date(parsed.data.checkIn),
      checkOut: new Date(parsed.data.checkOut),
      guestCount: parsed.data.guestCount,
      guestNote: parsed.data.guestNote,
    });

    redirect(`/bookings/confirm?id=${booking.id}`);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error; // Re-throw Next.js redirect
    }
    const message = error instanceof Error ? error.message : "Failed to create booking";
    return { error: message };
  }
}

export async function cancelBookingAction(bookingId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be logged in" };
  }

  try {
    await cancelBooking(bookingId, session.user.id, "guest");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel booking";
    return { error: message };
  }
}
