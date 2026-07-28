import { auth } from "@/lib/auth";
import {
  getConversationMessages,
  sendConversationMessage,
} from "@/lib/services/chat.service";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const result = await getConversationMessages(id, session.user.id);
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
  if (!limit.success) {
    return Response.json(
      { error: "Too many messages. Please wait a moment." },
      { status: 429 }
    );
  }

  let input: { body?: string };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const message = await sendConversationMessage({
      conversationId: id,
      senderId: session.user.id,
      body: input.body ?? "",
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
