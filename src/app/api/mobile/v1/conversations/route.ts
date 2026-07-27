import {
  ensureBookingConversation,
  listUserConversations,
} from "@/lib/services/chat.service";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const conversations = await listUserConversations(access.user.id);
  return mobileJson(request, {
    conversations: conversations.map((conversation) => ({
      ...conversation,
      booking: conversation.booking
        ? {
            ...conversation.booking,
            checkIn: conversation.booking.checkIn.toISOString(),
            checkOut: conversation.booking.checkOut.toISOString(),
          }
        : null,
      lastMessage: conversation.lastMessage
        ? {
            ...conversation.lastMessage,
            createdAt: conversation.lastMessage.createdAt.toISOString(),
          }
        : null,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  let input: { bookingId?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.bookingId) {
    return mobileJson(request, { error: "Booking is required" }, { status: 400 });
  }

  try {
    const conversation = await ensureBookingConversation(input.bookingId, access.user.id);
    const conversations = await listUserConversations(access.user.id);
    const accessible = conversations.find((item) => item.id === conversation.id);
    if (!accessible) {
      return mobileJson(request, { error: "Booking not found" }, { status: 404 });
    }
    return mobileJson(request, { conversationId: conversation.id }, { status: 201 });
  } catch (error) {
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Could not create conversation" },
      { status: 400 }
    );
  }
}
