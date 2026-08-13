import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import { getT, T } from "@/lib/i18n/t";

export interface ConversationListItem {
  id: string;
  kind: "INQUIRY" | "BOOKING";
  status: "OPEN" | "FROZEN" | "CLOSED";
  hasSupport: boolean;
  listing: { id: string; title: string; imageUrl: string | null };
  otherUser: { id: string; name: string | null; image: string | null };
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: Date | string | null;
}

export async function ConversationList({
  conversations,
}: {
  conversations: ConversationListItem[];
}) {
  const t = await getT();
  if (!conversations.length) {
    return (
      <EmptyState
        title={t.resolve("conversation.list.empty_title", "No conversations yet")}
        description={t.resolve("conversation.list.empty_description", "Messages about listings and bookings will appear here.")}
      />
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((conversation) => (
        <Link key={conversation.id} href={`/messages/${conversation.id}`} className="block">
          <Card className="transition-colors hover:border-primary/40 hover:bg-muted/20">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                {conversation.listing.imageUrl ? (
                  <Image
                    src={conversation.listing.imageUrl}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold">
                    {conversation.otherUser.id ? conversation.otherUser.name : <T t={t} k="conversation.deleted_user" source="Deleted user" />}
                  </p>
                  <Badge variant="secondary">
                    {conversation.kind === "INQUIRY" ? <T t={t} k="conversation.kind.inquiry" source="Inquiry" /> : <T t={t} k="conversation.kind.booking" source="Booking" />}
                  </Badge>
                  {conversation.hasSupport ? <Badge><T t={t} k="conversation.support_joined" source="Support joined" /></Badge> : null}
                </div>
                <p className="mt-1 truncate text-sm text-primary">
                  <span data-user-generated-content translate="yes">{conversation.listing.title}</span>
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {conversation.lastMessagePreview ? <span data-user-generated-content translate="yes">{conversation.lastMessagePreview}</span> : <T t={t} k="conversation.start" source="Start the conversation" />}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {conversation.lastMessageAt ? (
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(t.locale, {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(conversation.lastMessageAt))}
                  </p>
                ) : null}
                {conversation.unreadCount > 0 ? (
                  <span className="mt-2 inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
                    {conversation.unreadCount}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
