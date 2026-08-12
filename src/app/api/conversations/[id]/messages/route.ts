import { auth } from "@/lib/auth";
import {
  getConversationMessages,
  sendConversationMessage,
} from "@/lib/services/chat.service";
import { rateLimit } from "@/lib/rate-limit";
import { sendMessageSchema } from "@/lib/validations/communication.schema";
import { getRequestLocale } from "@/lib/email/i18n/request-locale";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const result = await getConversationMessages(id, session.user.id, { cursor });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  const limit = rateLimit(`chat:${session.user.id}`, 40, 60_000);
  const threadLimit = rateLimit(`chat-thread:${id}`, 120, 60_000);
  if (!limit.success || !threadLimit.success) {
    const resetAt = Math.max(limit.resetAt, threadLimit.resetAt);
    return Response.json(
      { error: "Too many messages. Please wait a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = sendMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message" },
      { status: 400 }
    );
  }

  try {
    const message = await sendConversationMessage({
      conversationId: id,
      senderId: session.user.id,
      body: parsed.data.body,
      clientId: parsed.data.clientId,
      sourceLocale: await getRequestLocale(),
    });
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not send message",
      },
      { status: 400 }
    );
  }
}
