import { auth } from "@/lib/auth";
import {
  createConversationDamageReport,
  updateConversationDamageReport,
} from "@/lib/services/damage-report.service";
import {
  damageReportSchema,
  damageReportUpdateSchema,
} from "@/lib/validations/communication.schema";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const limit = rateLimit(`damage-report:${session.user.id}`, 10, 60 * 60_000);
  if (!limit.success) {
    return Response.json({ error: "Too many damage reports" }, { status: 429 });
  }
  const parsed = damageReportSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid damage report" },
      { status: 400 }
    );
  }
  const { id } = await context.params;
  try {
    const report = await createConversationDamageReport({
      ...parsed.data,
      conversationId: id,
      reporterId: session.user.id,
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not report damage" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const raw = (await request.json().catch(() => null)) as
    | { damageReportId?: unknown; action?: unknown }
    | null;
  const parsed = damageReportUpdateSchema.safeParse({ action: raw?.action });
  if (
    !parsed.success ||
    typeof raw?.damageReportId !== "string" ||
    !raw.damageReportId
  ) {
    return Response.json({ error: "Invalid damage report update" }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const report = await updateConversationDamageReport({
      conversationId: id,
      damageReportId: raw.damageReportId,
      userId: session.user.id,
      action: parsed.data.action,
    });
    return Response.json({ report });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update damage report" },
      { status: 400 }
    );
  }
}
