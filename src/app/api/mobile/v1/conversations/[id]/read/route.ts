import { markConversationRead } from "@/lib/services/chat.service";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { markConversationReadSchema } from "@/lib/validations/communication.schema";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;
  const parsed = markConversationReadSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return mobileJson(request, { error: "Invalid read position" }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    await markConversationRead({
      conversationId: id,
      userId: access.user.id,
      lastMessageId: parsed.data.lastMessageId,
    });
    return mobileJson(request, { success: true });
  } catch {
    return mobileJson(request, { error: "Conversation not found" }, { status: 404 });
  }
}
