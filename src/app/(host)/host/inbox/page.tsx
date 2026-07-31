import { ConversationList } from "@/components/communication/conversation-list";
import { requireHostPage } from "@/lib/auth-helpers";
import { listUserConversations } from "@/lib/services/chat.service";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "Host Inbox" };

export default async function HostInboxPage() {
  const user = await requireHostPage();
  const conversations = await listUserConversations(user.id);
  const t = await getT();
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold">
        <T t={t} k="host.inbox.heading" source="Inbox" />
      </h1>
      <p className="mb-6 mt-1 text-muted-foreground">
        <T
          t={t}
          k="host.inbox.subheading"
          source="Answer inquiries and manage guest conversations."
        />
      </p>
      <ConversationList conversations={conversations} />
    </div>
  );
}
