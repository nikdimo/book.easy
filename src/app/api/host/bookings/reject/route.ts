import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rejectBooking } from "@/lib/services/booking.service";
import { createAuditLog } from "@/lib/services/audit.service";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookingId, reason } = await req.json();
  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  }

  try {
    const booking = await rejectBooking(bookingId, session.user.id, reason);
    await createAuditLog({
      userId: session.user.id,
      action: "booking.reject",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { rejectedBy: "host", reason },
    });
    return NextResponse.json({ success: true, booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reject";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
