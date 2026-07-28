import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

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

export function ConversationList({
  conversations,
}: {
  conversations: ConversationListItem[];
}) {
  if (!conversations.length) {
    return (
      <EmptyState
        title="No conversations yet"
        description="Messages about listings and bookings will appear here."
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
                    {conversation.otherUser.name || "Linger Homes member"}
                  </p>
                  <Badge variant="secondary">
                    {conversation.kind === "INQUIRY" ? "Inquiry" : "Booking"}
                  </Badge>
                  {conversation.hasSupport ? <Badge>Support joined</Badge> : null}
                </div>
                <p className="mt-1 truncate text-sm text-primary">
                  {conversation.listing.title}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {conversation.lastMessagePreview || "Start the conversation"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {conversation.lastMessageAt ? (
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en", {
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
