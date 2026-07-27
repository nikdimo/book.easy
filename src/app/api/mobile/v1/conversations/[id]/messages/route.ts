import {
  getConversationMessages,
  sendConversationMessage,
} from "@/lib/services/chat.service";
import { rateLimit } from "@/lib/rate-limit";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  try {
    const result = await getConversationMessages(id, access.user.id);
    return mobileJson(request, {
      conversation: {
        ...result.conversation,
        booking: result.conversation.booking
          ? {
              ...result.conversation.booking,
              checkIn: result.conversation.booking.checkIn.toISOString(),
              checkOut: result.conversation.booking.checkOut.toISOString(),
            }
          : null,
      },
      messages: result.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        deletedAt: message.deletedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Conversation unavailable" },
      { status: 404 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  const limit = rateLimit(`chat:${access.user.id}`, 40, 60_000);
  if (!limit.success) {
    return mobileJson(
      request,
      { error: "Too many messages. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  let input: { body?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const message = await sendConversationMessage({
      conversationId: id,
      senderId: access.user.id,
      body: input.body ?? "",
    });
    return mobileJson(
      request,
      {
        message: {
          ...message,
          createdAt: message.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Could not send message" },
      { status: 400 }
    );
  }
}
