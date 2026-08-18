import { HostInboxShell } from "@/components/host/v2/messages/host-inbox-shell";
import { requireHostPage } from "@/lib/auth-helpers";
import { listHostInboxConversations } from "@/lib/services/host-inbox.service";

export const metadata = { title: "Messages" };

/**
 * The conversation column belongs to the layout, not to the page, so it survives every
 * navigation between threads — the host keeps their place in the list while the thread
 * beside it changes. `listHostInboxConversations` is scoped to this host's own listings,
 * so the column can only ever contain threads they are entitled to open.
 */
export default async function HostV2MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireHostPage();
  const conversations = await listHostInboxConversations(user.id);

  return <HostInboxShell conversations={conversations}>{children}</HostInboxShell>;
}
