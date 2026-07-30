import { auth } from "@/lib/auth";
import { markConversationRead } from "@/lib/services/chat.service";
import { markConversationReadSchema } from "@/lib/validations/communication.schema";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = markConversationReadSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid read position" }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    await markConversationRead({
      conversationId: id,
      userId: session.user.id,
      lastMessageId: parsed.data.lastMessageId,
    });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
}
