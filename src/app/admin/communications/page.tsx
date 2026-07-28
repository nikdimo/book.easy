import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { requireAdminPage } from "@/lib/auth-helpers";
import { listAdminConversations } from "@/lib/services/chat.service";

export const metadata = { title: "Communications" };

export default async function AdminCommunicationsPage() {
  await requireAdminPage();
  const conversations = await listAdminConversations();
  return (
    <div>
      <h1 className="text-2xl font-bold">Communications</h1>
      <p className="mb-6 mt-1 text-muted-foreground">
        Oversight of guest and host conversations. Opening a thread is audited.
      </p>
      {!conversations.length ? (
        <EmptyState title="No conversations" description="User conversations will appear here." />
      ) : (
        <div className="space-y-3">
          {conversations.map((conversation) => {
            const members = conversation.participants.filter((participant) => participant.role !== "SUPPORT");
            return (
              <Link key={conversation.id} href={`/admin/communications/${conversation.id}`}>
                <Card className="mb-3 hover:border-primary/40">
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{conversation.kind}</Badge>
                        <Badge variant="outline">{conversation.status}</Badge>
                        {conversation.supportJoinedAt ? <Badge>SUPPORT JOINED</Badge> : null}
                        {conversation._count.safetyCases ? (
                          <Badge variant="destructive">{conversation._count.safetyCases} CASES</Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 font-semibold">{conversation.listing.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {members.map((participant) => participant.user.name || participant.user.email).join(" ↔ ")}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{conversation._count.messages} messages</p>
                      <p>{conversation.lastMessageAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(conversation.lastMessageAt) : "Not started"}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
