import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { JoinSupportButton } from "@/components/admin/join-support-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/services/audit.service";
import { getConversationForAdmin } from "@/lib/services/chat.service";

export default async function AdminConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  let conversation;
  try {
    conversation = await getConversationForAdmin(id);
  } catch {
    notFound();
  }
  await createAuditLog({
    userId: admin.id,
    action: "conversation.view",
    entityType: "Conversation",
    entityId: id,
  });
  const joined = conversation.participants.some(
    (participant) => participant.userId === admin.id && participant.role === "SUPPORT"
  );
  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/admin/communications"><ArrowLeft className="mr-1 h-4 w-4" /> Communications</Link>
      </Button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex gap-2"><Badge>{conversation.kind}</Badge><Badge variant="outline">{conversation.status}</Badge></div>
          <h1 className="mt-2 text-2xl font-bold">{conversation.listing.title}</h1>
          <p className="text-sm text-muted-foreground">
            {conversation.participants.filter((p) => p.role !== "SUPPORT").map((p) => `${p.user.name} (${p.user.email})`).join(" ↔ ")}
          </p>
        </div>
        <JoinSupportButton conversationId={id} joined={joined} />
      </div>
      {conversation.safetyCases.length ? (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-semibold">Related cases</p>
          {conversation.safetyCases.map((item) => (
            <Link key={item.id} href={`/admin/cases/${item.id}`} className="mr-3 text-sm underline">
              {item.reference} ({item.status})
            </Link>
          ))}
        </div>
      ) : null}
      <div className="space-y-3 rounded-2xl border bg-muted/20 p-4 sm:p-6">
        {conversation.messages.map((message) => (
          <div key={message.id} className="rounded-xl border bg-background p-3">
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>{message.sender?.name || "Deleted user"} · {message.sender?.email}</span>
              <span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(message.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{message.deletedAt ? "Message removed" : message.body}</p>
          </div>
        ))}
        {!conversation.messages.length ? <p className="text-sm text-muted-foreground">No messages yet.</p> : null}
      </div>
    </div>
  );
}
