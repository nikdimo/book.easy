import { auth } from "@/lib/auth";
import { getUserAttentionSummary } from "@/lib/services/attention.service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return Response.json(
    await getUserAttentionSummary(session.user.id, Boolean(session.user.isHost))
  );
}
