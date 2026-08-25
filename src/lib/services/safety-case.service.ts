import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ClaimKind,
  SafetyCasePriority,
  SafetyCaseStatus,
  SafetyCaseTargetType,
  SafetyCaseType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { createUserNotification } from "@/lib/services/notification.service";
import { createAuditLog } from "@/lib/services/audit.service";

export const REPORT_CATEGORIES = [
  "Safety concern",
  "Harassment or abusive behavior",
  "Fraud or scam",
  "Discrimination",
  "Property information is misleading",
  "Spam",
  "Other",
] as const;

export const CLAIM_CATEGORIES = [
  "Property not as described",
  "Host cancellation",
  "Guest damage",
  "Payment or refund",
  "Safety incident",
  "Missing item",
  "Other",
] as const;

export interface SafetyCaseEvidenceInput {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CreateSafetyCaseInput {
  reporterId: string;
  type: SafetyCaseType;
  targetType: SafetyCaseTargetType;
  category: string;
  subject: string;
  description: string;
  listingId?: string;
  bookingId?: string;
  messageId?: string;
  reportedUserId?: string;
  evidence?: SafetyCaseEvidenceInput[];
  claimKind?: ClaimKind;
  requestedAmount?: number;
  currency?: string;
}

function newReference() {
  const year = new Date().getUTCFullYear();
  return `LH-${year}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function cleanText(value: string, label: string, min: number, max: number) {
  const cleaned = value.trim();
  if (cleaned.length < min) throw new Error(`${label} is too short`);
  if (cleaned.length > max) throw new Error(`${label} is too long`);
  return cleaned;
}

function validateEvidence(evidence: SafetyCaseEvidenceInput[]) {
  if (evidence.length > 5) throw new Error("You can attach up to 5 evidence files");
  for (const item of evidence) {
    if (!item.url.startsWith("/uploads/")) throw new Error("Invalid evidence file");
    if (!item.fileName.trim() || item.fileName.length > 255) {
      throw new Error("Invalid evidence filename");
    }
    if (!Number.isInteger(item.sizeBytes) || item.sizeBytes < 1) {
      throw new Error("Invalid evidence file size");
    }
  }
}

async function resolveTarget(input: CreateSafetyCaseInput) {
  if (input.type === "CLAIM" && !input.bookingId) {
    throw new Error("Claims must be connected to a booking");
  }

  if (input.messageId) {
    const message = await db.message.findUnique({
      where: { id: input.messageId },
      select: {
        id: true,
        senderId: true,
        conversationId: true,
        conversation: {
          select: {
            listingId: true,
            bookingId: true,
            participants: { where: { userId: input.reporterId }, select: { userId: true } },
          },
        },
      },
    });
    if (!message || message.conversation.participants.length === 0) {
      throw new Error("Message not found");
    }
    return {
      listingId: message.conversation.listingId,
      bookingId: message.conversation.bookingId ?? undefined,
      messageId: message.id,
      conversationId: message.conversationId,
      reportedUserId: message.senderId ?? undefined,
    };
  }

  if (input.bookingId) {
    const booking = await db.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        listingId: true,
        guestId: true,
        listing: { select: { hostId: true } },
        conversation: { select: { id: true } },
      },
    });
    if (
      !booking ||
      (booking.guestId !== input.reporterId &&
        booking.listing.hostId !== input.reporterId)
    ) {
      throw new Error("Booking not found");
    }
    return {
      listingId: booking.listingId,
      bookingId: booking.id,
      conversationId: booking.conversation?.id,
      reportedUserId:
        input.reporterId === booking.guestId
          ? booking.listing.hostId
          : booking.guestId,
    };
  }

  if (input.listingId) {
    const listing = await db.listing.findUnique({
      where: { id: input.listingId },
      select: { id: true, hostId: true },
    });
    if (!listing) throw new Error("Listing not found");
    return {
      listingId: listing.id,
      reportedUserId:
        input.targetType === "HOST" ? listing.hostId : input.reportedUserId,
    };
  }

  if (input.reportedUserId) {
    if (input.reportedUserId === input.reporterId) {
      throw new Error("You cannot report your own account");
    }
    const user = await db.user.findFirst({
      where: {
        id: input.reportedUserId,
        ...(input.targetType === "HOST" ? { isHost: true } : {}),
      },
      select: { id: true },
    });
    if (!user) throw new Error("User not found");
    return { reportedUserId: user.id };
  }

  throw new Error("Choose what you are reporting");
}

export async function createSafetyCase(input: CreateSafetyCaseInput) {
  const reporter = await db.user.findFirst({
    where: { id: input.reporterId, isActive: true },
    select: { id: true },
  });
  if (!reporter) throw new Error("Sign in to submit a report or claim");

  const categories =
    input.type === "CLAIM" ? CLAIM_CATEGORIES : REPORT_CATEGORIES;
  if (!categories.includes(input.category as never)) {
    throw new Error("Choose a valid category");
  }

  const subject = cleanText(input.subject, "Subject", 5, 120);
  const description = cleanText(input.description, "Description", 20, 5000);
  const evidence = input.evidence ?? [];
  validateEvidence(evidence);
  const target = await resolveTarget(input);
  let requestedAmount: number | undefined;
  let currency: string | undefined;
  if (input.type === "CLAIM") {
    if (!input.claimKind || !["EXPENSE", "DAMAGE", "REFUND"].includes(input.claimKind)) {
      throw new Error("Choose a valid request type");
    }
    requestedAmount = Number(input.requestedAmount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > 100_000) {
      throw new Error("Enter a valid requested amount");
    }
    currency = (input.currency || "EUR").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a valid currency");
    if (input.claimKind === "DAMAGE" && evidence.length === 0) {
      throw new Error("Add at least one photo, invoice, or document for a damage claim");
    }
  }

  const safetyCase = await db.safetyCase.create({
    data: {
      reference: newReference(),
      type: input.type,
      targetType: input.targetType,
      category: input.category,
      subject,
      description,
      reporterId: input.reporterId,
      claimKind: input.type === "CLAIM" ? input.claimKind : undefined,
      requestedAmount,
      currency,
      responseStatus: input.type === "CLAIM" ? "AWAITING_ADMIN" : undefined,
      ...target,
      evidence: evidence.length
        ? {
            create: evidence.map((item) => ({
              url: item.url,
              fileName: item.fileName.trim(),
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
            })),
          }
        : undefined,
    },
  });

  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await Promise.all([
    createUserNotification({
      userId: input.reporterId,
      type: "CASE_SUBMITTED",
      title: `${input.type === "CLAIM" ? "Claim" : "Report"} submitted`,
      body: `${safetyCase.reference}: ${safetyCase.subject}`,
      route: `/account/support/${safetyCase.id}`,
      data: { caseId: safetyCase.id, reference: safetyCase.reference },
    }),
    ...admins.map((admin) =>
      createUserNotification({
        userId: admin.id,
        type: "CASE_SUBMITTED",
        title: `New ${input.type.toLowerCase()}`,
        body: `${safetyCase.reference}: ${safetyCase.subject}`,
        route: `/admin/cases/${safetyCase.id}`,
        data: { caseId: safetyCase.id, reference: safetyCase.reference },
      })
    ),
  ]);

  void import("@/lib/email")
    .then(({ notifySafetyCaseSubmitted }) =>
      notifySafetyCaseSubmitted({ caseId: safetyCase.id })
    )
    .catch(() => {});

  return safetyCase;
}

export function listUserSafetyCases(userId: string) {
  return db.safetyCase.findMany({
    where: { OR: [{ reporterId: userId }, { reportedUserId: userId }] },
    include: {
      reporter: { select: { id: true, name: true } },
      reportedUser: { select: { id: true, name: true } },
      listing: { select: { id: true, title: true } },
      booking: { select: { id: true } },
      _count: { select: { evidence: true, updates: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getUserSafetyCase(caseId: string, userId: string) {
  return db.safetyCase.findFirst({
    where: {
      id: caseId,
      OR: [{ reporterId: userId }, { reportedUserId: userId }],
    },
    include: {
      reporter: { select: { id: true, name: true } },
      listing: { select: { id: true, title: true } },
      booking: {
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
          listing: { select: { title: true } },
        },
      },
      reportedUser: { select: { id: true, name: true } },
      evidence: true,
      updates: {
        where: { isInternal: false },
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export function listAdminSafetyCases() {
  return db.safetyCase.findMany({
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      reportedUser: { select: { id: true, name: true, email: true } },
      assignedAdmin: { select: { id: true, name: true } },
      listing: { select: { id: true, title: true } },
      booking: { select: { id: true } },
      _count: { select: { evidence: true, updates: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export function getAdminSafetyCase(caseId: string) {
  return db.safetyCase.findUnique({
    where: { id: caseId },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      reportedUser: { select: { id: true, name: true, email: true } },
      assignedAdmin: { select: { id: true, name: true } },
      listing: { select: { id: true, title: true } },
      booking: { select: { id: true, checkIn: true, checkOut: true } },
      message: { select: { id: true, body: true, createdAt: true } },
      conversation: { select: { id: true } },
      evidence: true,
      updates: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function addUserSafetyCaseUpdate(input: {
  caseId: string;
  userId: string;
  body: string;
}) {
  const safetyCase = await db.safetyCase.findFirst({
    where: {
      id: input.caseId,
      OR: [{ reporterId: input.userId }, { reportedUserId: input.userId }],
    },
    select: { id: true, reference: true, status: true },
  });
  if (!safetyCase) throw new Error("Case not found");
  if (["RESOLVED", "REJECTED"].includes(safetyCase.status)) {
    throw new Error("This case is closed");
  }
  const body = cleanText(input.body, "Message", 2, 3000);
  const update = await db.safetyCaseUpdate.create({
    data: { caseId: input.caseId, authorId: input.userId, body },
  });

  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await Promise.all(
    admins.map((admin) =>
      createUserNotification({
        userId: admin.id,
        type: "CASE_UPDATED",
        title: `Reply on ${safetyCase.reference}`,
        body: body.slice(0, 160),
        route: `/admin/cases/${input.caseId}`,
        data: { caseId: input.caseId },
      })
    )
  );
  return update;
}

export async function updateSafetyCaseByAdmin(input: {
  caseId: string;
  adminId: string;
  status: SafetyCaseStatus;
  priority: SafetyCasePriority;
  note?: string;
  internal?: boolean;
  resolution?: string;
  assignToSelf?: boolean;
}) {
  const existing = await db.safetyCase.findUnique({
    where: { id: input.caseId },
    select: { id: true, reporterId: true, reference: true },
  });
  if (!existing) throw new Error("Case not found");

  const note = input.note?.trim();
  const resolution = input.resolution?.trim();
  const isClosed = input.status === "RESOLVED" || input.status === "REJECTED";
  if (isClosed && !resolution) {
    throw new Error("A resolution is required to close a case");
  }

  const safetyCase = await db.$transaction(async (tx) => {
    const updated = await tx.safetyCase.update({
      where: { id: input.caseId },
      data: {
        status: input.status,
        priority: input.priority,
        assignedAdminId: input.assignToSelf ? input.adminId : undefined,
        resolution: isClosed ? resolution : undefined,
        resolvedAt: isClosed ? new Date() : null,
      },
    });
    if (note) {
      await tx.safetyCaseUpdate.create({
        data: {
          caseId: input.caseId,
          authorId: input.adminId,
          body: note,
          isInternal: Boolean(input.internal),
        },
      });
    }
    return updated;
  });

  await createAuditLog({
    userId: input.adminId,
    action: "safety_case.update",
    entityType: "SafetyCase",
    entityId: input.caseId,
    metadata: {
      status: input.status,
      priority: input.priority,
      internalNote: Boolean(note && input.internal),
    },
  });

  if (!input.internal) {
    const message =
      note ||
      resolution ||
      `Your case ${existing.reference} is now ${input.status.replaceAll("_", " ").toLowerCase()}.`;
    await createUserNotification({
      userId: existing.reporterId,
      type: "CASE_UPDATED",
      title: `Update for ${existing.reference}`,
      body: message.slice(0, 180),
      route: `/account/support/${input.caseId}`,
      data: { caseId: input.caseId },
    });
    void import("@/lib/email")
      .then(({ notifySafetyCaseUpdated }) =>
        notifySafetyCaseUpdated({ caseId: input.caseId, message })
      )
      .catch(() => {});
  }

  return safetyCase;
}

export async function releaseClaimToRecipient(input: {
  caseId: string;
  adminId: string;
}) {
  const existing = await db.safetyCase.findUnique({
    where: { id: input.caseId },
    select: {
      id: true,
      type: true,
      reference: true,
      subject: true,
      reportedUserId: true,
      responseStatus: true,
    },
  });
  if (!existing || existing.type !== "CLAIM") throw new Error("Claim not found");
  if (!existing.reportedUserId) throw new Error("This claim has no recipient");
  if (existing.responseStatus !== "AWAITING_ADMIN") {
    throw new Error("This claim has already been released");
  }

  const now = new Date();
  const respondBy = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const claim = await db.$transaction(async (tx) => {
    const updated = await tx.safetyCase.update({
      where: { id: input.caseId },
      data: {
        status: "UNDER_REVIEW",
        responseStatus: "AWAITING_RECIPIENT",
        adminApprovedAt: now,
        assignedAdminId: input.adminId,
        respondBy,
      },
    });
    await tx.safetyCaseUpdate.create({
      data: {
        caseId: input.caseId,
        authorId: input.adminId,
        body: "The request passed initial admin review and was sent to the other party for a response.",
      },
    });
    return updated;
  });

  await createAuditLog({
    userId: input.adminId,
    action: "claim.release_to_recipient",
    entityType: "SafetyCase",
    entityId: input.caseId,
  });
  await createUserNotification({
    userId: existing.reportedUserId,
    type: "CASE_UPDATED",
    title: `Payment request ${existing.reference}`,
    body: existing.subject,
    route: `/account/support/${input.caseId}`,
    data: { caseId: input.caseId, respondBy: respondBy.toISOString() },
  });
  void import("@/lib/email")
    .then(({ notifyClaimReleased }) => notifyClaimReleased({ caseId: input.caseId }))
    .catch(() => {});
  return claim;
}

export async function respondToClaim(input: {
  caseId: string;
  userId: string;
  response: "ACCEPT" | "REJECT" | "COUNTER";
  note?: string;
  counterAmount?: number;
}) {
  const claim = await db.safetyCase.findFirst({
    where: {
      id: input.caseId,
      type: "CLAIM",
      reportedUserId: input.userId,
      responseStatus: "AWAITING_RECIPIENT",
    },
    select: {
      id: true,
      reporterId: true,
      reference: true,
      requestedAmount: true,
      currency: true,
    },
  });
  if (!claim) throw new Error("This request is not awaiting your response");

  const note = input.note?.trim();
  if ((input.response === "REJECT" || input.response === "COUNTER") && !note) {
    throw new Error("Explain your response");
  }
  let counterAmount: number | undefined;
  if (input.response === "COUNTER") {
    counterAmount = Number(input.counterAmount);
    if (
      !Number.isFinite(counterAmount) ||
      counterAmount <= 0 ||
      counterAmount > 100_000
    ) {
      throw new Error("Enter a valid counteroffer");
    }
  }
  const responseStatus =
    input.response === "ACCEPT"
      ? "ACCEPTED"
      : input.response === "REJECT"
        ? "REJECTED"
        : "COUNTERED";
  const amountLabel =
    input.response === "COUNTER"
      ? `${counterAmount!.toFixed(2)} ${claim.currency || "EUR"}`
      : claim.requestedAmount
        ? `${Number(claim.requestedAmount).toFixed(2)} ${claim.currency || "EUR"}`
        : "";
  const body =
    input.response === "ACCEPT"
      ? `The payment request was accepted for ${amountLabel}. Linger Homes does not process payments — settle the agreed amount directly with the other party.`
      : input.response === "REJECT"
        ? `The payment request was rejected. Reason: ${note}`
        : `A counteroffer of ${amountLabel} was submitted. Reason: ${note}`;

  const updated = await db.$transaction(async (tx) => {
    const item = await tx.safetyCase.update({
      where: { id: input.caseId },
      data: {
        responseStatus,
        counterAmount,
        responseNote: note || null,
        status: "UNDER_REVIEW",
      },
    });
    await tx.safetyCaseUpdate.create({
      data: {
        caseId: input.caseId,
        authorId: input.userId,
        body,
      },
    });
    return item;
  });

  await createUserNotification({
    userId: claim.reporterId,
    type: "CASE_UPDATED",
    title: `Response to ${claim.reference}`,
    body: body.slice(0, 180),
    route: `/account/support/${input.caseId}`,
    data: { caseId: input.caseId },
  });
  void import("@/lib/email")
    .then(({ notifyClaimResponse }) => notifyClaimResponse({ caseId: input.caseId }))
    .catch(() => {});
  return updated;
}
