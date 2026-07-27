import { createAuditLog } from "@/lib/services/audit.service";
import {
  cancelBooking,
  confirmBooking,
  rejectBooking,
} from "@/lib/services/booking.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

type BookingAction = "confirm" | "reject" | "cancel";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const { id } = await context.params;
  let input: { action?: BookingAction; reason?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (input.action === "confirm") {
      await confirmBooking(id, access.user.id);
    } else if (input.action === "reject") {
      await rejectBooking(id, access.user.id, input.reason);
    } else if (input.action === "cancel") {
      if (!input.reason?.trim()) {
        return mobileJson(
          request,
          { error: "Cancellation reason is required" },
          { status: 400 }
        );
      }
      await cancelBooking(id, access.user.id, "host", input.reason);
    } else {
      return mobileJson(request, { error: "Unsupported booking action" }, { status: 400 });
    }

    await createAuditLog({
      userId: access.user.id,
      action: `booking.${input.action}_mobile`,
      entityType: "Booking",
      entityId: id,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    return mobileJson(request, { success: true });
  } catch (error) {
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Booking update failed" },
      { status: 400 }
    );
  }
}
