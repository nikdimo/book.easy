import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmBooking } from "@/lib/services/booking.service";
import { createAuditLog } from "@/lib/services/audit.service";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookingId } = await req.json();
  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  }

  try {
    const booking = await confirmBooking(bookingId, session.user.id);
    await createAuditLog({
      userId: session.user.id,
      action: "booking.confirm",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { confirmedBy: "host" },
    });
    return NextResponse.json({ success: true, booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to confirm";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
