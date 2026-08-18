import { notFound } from "next/navigation";
import { InboxThread } from "@/components/host/v2/messages/inbox-thread";
import { requireHostPage } from "@/lib/auth-helpers";
import { getConversationMessages } from "@/lib/services/chat.service";
import { getHostInboxReservation } from "@/lib/services/host-inbox.service";

export const metadata = { title: "Messages" };

export default async function HostV2ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();

  // Two independent checks, and both must pass. The reservation read is scoped to
  // `listing.hostId`, so it returns nothing for a conversation on somebody else's
  // listing — including one where this user is the guest, which belongs in their
  // account inbox rather than in the host panel. The thread read re-checks membership
  // on its own, so neither query is trusting the other's filter.
  const [reservation, thread] = await Promise.all([
    getHostInboxReservation(id, user.id),
    getConversationMessages(id, user.id).catch(() => null),
  ]);
  if (!reservation || !thread) notFound();

  return (
    <InboxThread
      initial={thread}
      reservation={reservation}
      currentUserId={user.id}
    />
  );
}
