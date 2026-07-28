import { notFound } from "next/navigation";
import { ConversationThread } from "@/components/communication/conversation-thread";
import { requireUserPage } from "@/lib/auth-helpers";
import { getConversationMessages } from "@/lib/services/chat.service";

export const metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUserPage(`/messages/${id}`);
  let thread;
  try {
    thread = await getConversationMessages(id, user.id);
  } catch {
    notFound();
  }
  return <ConversationThread initial={thread} currentUserId={user.id} />;
}
