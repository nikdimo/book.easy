import { listAdminConversations } from "@/lib/services/chat.service";
import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";

/** Platform-wide conversation overview.
 *
 *  Deliberately metadata only — participants, counts, the linked booking and
 *  listing. Message bodies are not returned and must not be added here: an admin
 *  does not get blanket access to private host/guest conversations. Reading a thread
 *  requires joining it as support through joinConversationAsSupport, which records
 *  who joined and makes the participation visible. This endpoint mirrors what the
 *  web admin overview shows, and nothing more. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const conversations = await listAdminConversations();

  return mobileJson(request, {
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      kind: conversation.kind,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
      listing: conversation.listing
        ? { id: conversation.listing.id, title: conversation.listing.title }
        : null,
      booking: conversation.booking
        ? { id: conversation.booking.id, status: conversation.booking.status }
        : null,
      participants: conversation.participants.map((participant) => ({
        id: participant.user.id,
        name: participant.user.name,
        role: participant.user.role,
      })),
      messageCount: conversation._count.messages,
      safetyCaseCount: conversation._count.safetyCases,
      // True when an admin has already joined as support — the visible, audited
      // signal that someone from the platform is in the thread.
      hasSupport: conversation.participants.some(
        (participant) => participant.role === "SUPPORT"
      ),
    })),
  });
}
