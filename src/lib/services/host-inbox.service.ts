import "server-only";

import { db } from "@/lib/db";

/**
 * Reads for the host inbox.
 *
 * The generic chat service already answers "what can this user see"; these two answer
 * the narrower question the host panel asks — "what is happening on MY listings" — and
 * carry the reservation facts the right-hand rail shows next to a thread. Both are
 * scoped by `listing.hostId` on top of participant membership, so a thread where the
 * same person is the guest on somebody else's listing can never appear in the host
 * inbox, and a conversation id guessed from elsewhere cannot open a reservation panel.
 */

export interface HostInboxConversation {
  id: string;
  kind: "INQUIRY" | "BOOKING";
  status: "OPEN" | "FROZEN" | "CLOSED";
  hasSupport: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  guest: { id: string; name: string | null; image: string | null };
  listing: { id: string; title: string; imageUrl: string | null };
  booking: {
    id: string;
    status: string;
    checkIn: string;
    checkOut: string;
  } | null;
}

export async function listHostInboxConversations(
  hostId: string
): Promise<HostInboxConversation[]> {
  const rows = await db.conversation.findMany({
    where: {
      listing: { hostId },
      participants: { some: { userId: hostId } },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      booking: {
        select: { id: true, status: true, checkIn: true, checkOut: true },
      },
      listing: {
        select: {
          id: true,
          title: true,
          images: {
            where: { isPrimary: true },
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { url: true },
          },
        },
      },
      participants: {
        select: {
          userId: true,
          role: true,
          unreadCount: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((row) => {
    const membership = row.participants.find(
      (participant) => participant.userId === hostId
    );
    const guest = row.participants.find(
      (participant) => participant.userId !== hostId && participant.role !== "SUPPORT"
    );
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      hasSupport: row.participants.some(
        (participant) => participant.role === "SUPPORT"
      ),
      unreadCount: membership?.unreadCount ?? 0,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: row.lastMessagePreview,
      guest: guest?.user ?? { id: "", name: null, image: null },
      listing: {
        id: row.listing.id,
        title: row.listing.title,
        imageUrl: row.listing.images[0]?.url ?? null,
      },
      booking: row.booking
        ? {
            id: row.booking.id,
            status: row.booking.status,
            checkIn: row.booking.checkIn.toISOString(),
            checkOut: row.booking.checkOut.toISOString(),
          }
        : null,
    };
  });
}

export interface HostInboxReservation {
  conversationId: string;
  kind: "INQUIRY" | "BOOKING";
  guest: { id: string; name: string | null; image: string | null };
  listing: {
    id: string;
    title: string;
    imageUrl: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
  };
  booking: {
    id: string;
    reference: string;
    status: string;
    checkIn: string;
    checkOut: string;
    numberOfNights: number;
    guestCount: number;
    currency: string;
    totalPrice: number;
    createdAt: string;
    guestNote: string | null;
    detailsUrl: string;
  } | null;
}

export async function getHostInboxReservation(
  conversationId: string,
  hostId: string
): Promise<HostInboxReservation | null> {
  const row = await db.conversation.findFirst({
    where: {
      id: conversationId,
      listing: { hostId },
      participants: { some: { userId: hostId } },
    },
    select: {
      id: true,
      kind: true,
      listing: {
        select: {
          id: true,
          title: true,
          checkInTime: true,
          checkOutTime: true,
          images: {
            where: { isPrimary: true },
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { url: true },
          },
        },
      },
      participants: {
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
      booking: {
        select: {
          id: true,
          reference: true,
          status: true,
          checkIn: true,
          checkOut: true,
          numberOfNights: true,
          guestCount: true,
          currency: true,
          totalPrice: true,
          createdAt: true,
          guestNote: true,
        },
      },
    },
  });
  if (!row) return null;

  const guest = row.participants.find(
    (participant) => participant.userId !== hostId && participant.role !== "SUPPORT"
  );

  return {
    conversationId: row.id,
    kind: row.kind,
    guest: guest?.user ?? { id: "", name: null, image: null },
    listing: {
      id: row.listing.id,
      title: row.listing.title,
      imageUrl: row.listing.images[0]?.url ?? null,
      checkInTime: row.listing.checkInTime,
      checkOutTime: row.listing.checkOutTime,
    },
    booking: row.booking
      ? {
          id: row.booking.id,
          reference: row.booking.reference,
          status: row.booking.status,
          checkIn: row.booking.checkIn.toISOString(),
          checkOut: row.booking.checkOut.toISOString(),
          numberOfNights: row.booking.numberOfNights,
          guestCount: row.booking.guestCount,
          currency: row.booking.currency,
          // Decimal crosses the server/client boundary as a plain number, the same way
          // the chat service hands the thread its total.
          totalPrice: Number(row.booking.totalPrice),
          createdAt: row.booking.createdAt.toISOString(),
          guestNote: row.booking.guestNote,
          detailsUrl: `/host/bookings/${row.booking.id}`,
        }
      : null,
  };
}
