"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { HostInboxConversation } from "@/lib/services/host-inbox.service";
import { InboxConversationList } from "./inbox-conversation-list";
import { PANE } from "./inbox-surface";

/**
 * The inbox frame: a conversation column that never unmounts, and whatever thread the
 * route has selected beside it.
 *
 * The list lives in the layout rather than the page so that opening a thread is a
 * navigation, not a re-render of the whole inbox — the column keeps its scroll position,
 * its filter and its search text while threads swap in and out beside it.
 *
 * Below `lg` there is only ever one column on screen: the list at `/host/v2/messages`,
 * the thread at `/host/v2/messages/<id>`. Two panes side by side on a phone would make
 * both unusable, and the route is already the state that says which one the host is
 * looking at — so back goes to the list without any of it being kept in React.
 */
export function HostInboxShell({
  conversations,
  children,
}: {
  conversations: HostInboxConversation[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/host/v2/messages/")
    ? pathname.slice("/host/v2/messages/".length).split("/")[0] || null
    : null;

  return (
    <div
      className={cn(
        // Below `md` the panel is an ordinary scrolling document, so the inbox has to
        // claim a height of its own or its panes would have nothing to scroll inside.
        // `6rem` is the shell's own mobile bottom padding, which is what keeps the
        // fixed bottom navigation clear of the composer.
        "flex h-[calc(100dvh-6rem)] w-full gap-3 md:h-auto md:min-h-0 md:flex-1 xl:gap-4"
      )}
    >
      <aside
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col lg:w-[21rem] xl:w-[23.5rem]",
          PANE,
          activeId && "hidden lg:flex"
        )}
      >
        <InboxConversationList conversations={conversations} activeId={activeId} />
      </aside>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 gap-3 xl:gap-4",
          !activeId && "hidden lg:flex"
        )}
      >
        {children}
      </div>
    </div>
  );
}
