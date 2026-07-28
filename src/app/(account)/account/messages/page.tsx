import { ConversationList } from "@/components/communication/conversation-list";
import { requireUserPage } from "@/lib/auth-helpers";
import { listUserConversations } from "@/lib/services/chat.service";

export const metadata = { title: "Messages" };

export default async function AccountMessagesPage() {
  const user = await requireUserPage("/account/messages");
  const conversations = await listUserConversations(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Messages</h1>
      <p className="mb-6 mt-1 text-muted-foreground">
        Private conversations with hosts, guests, and Linger Homes Support.
      </p>
      <ConversationList conversations={conversations} />
    </div>
  );
}
