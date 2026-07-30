import { auth } from "@/lib/auth";
import { assertConversationMembership } from "@/lib/services/chat.service";
import { subscribeConversationChanged } from "@/lib/services/communication-realtime.service";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    await assertConversationMembership(id, session.user.id);
  } catch {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (payload: string) => {
        if (!closed) controller.enqueue(encoder.encode(payload));
      };
      const unsubscribe = subscribeConversationChanged(id, () =>
        send(`event: refresh\ndata: ${JSON.stringify({ conversationId: id })}\n\n`)
      );
      const heartbeat = setInterval(() => send(": keep-alive\n\n"), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // The browser may have already cancelled the stream.
        }
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
      send("event: connected\ndata: {}\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
