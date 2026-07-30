import { auth } from "@/lib/auth";
import {
  ensureBookingConversation,
  ensureInquiryConversation,
} from "@/lib/services/chat.service";
import { rateLimit } from "@/lib/rate-limit";
import { conversationStartSchema } from "@/lib/validations/communication.schema";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const limit = rateLimit(`conversation-start:${session.user.id}`, 20, 60_000);
  if (!limit.success) {
    return Response.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = conversationStartSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  try {
    const conversation = input.bookingId
      ? await ensureBookingConversation(input.bookingId, session.user.id)
      : input.listingId
        ? await ensureInquiryConversation(input.listingId, session.user.id)
        : null;
    if (!conversation) {
      return Response.json(
        { error: "A listing or booking is required" },
        { status: 400 }
      );
    }
    return Response.json(
      { conversationId: conversation.id },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create conversation",
      },
      { status: 400 }
    );
  }
}
