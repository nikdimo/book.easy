/**
 * The one way to open the Host V2 inbox.
 *
 * The Today page used to send "Damage reports" to `/host/inbox`, the classic panel,
 * which drops a host out of the V2 shell mid-task. The path lives here beside the
 * calendar's equivalent so a link written somewhere else cannot drift back to it.
 *
 * Nothing here authorizes anything. A conversation id is a request: the thread route
 * re-reads it scoped to `listing.hostId` and to participant membership, so an id that
 * is not this host's cannot render. `hostMessagesHref()` with nothing to open falls
 * back to the inbox itself rather than to a thread that would 404.
 */

export const HOST_MESSAGES_PATH = "/host/messages";

/** cuid/uuid shaped — the same narrow shape the calendar's listing id is held to. */
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The Host V2 inbox, opened on `conversationId` when one is given. */
export function hostMessagesHref(conversationId?: string | null): string {
  const id = conversationId?.trim();
  if (!id || !CONVERSATION_ID_PATTERN.test(id)) return HOST_MESSAGES_PATH;
  return `${HOST_MESSAGES_PATH}/${encodeURIComponent(id)}`;
}
