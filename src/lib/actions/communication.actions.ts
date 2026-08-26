"use server";

import type {
  ClaimKind,
  SafetyCasePriority,
  SafetyCaseStatus,
  SafetyCaseTargetType,
  SafetyCaseType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin, requireHost } from "@/lib/auth-helpers";
import {
  ensureInquiryConversation,
  joinConversationAsSupport,
  shareBookingPaymentInstructions,
} from "@/lib/services/chat.service";
import {
  addUserSafetyCaseUpdate,
  createSafetyCase,
  releaseClaimToRecipient,
  respondToClaim,
  updateSafetyCaseByAdmin,
  type SafetyCaseEvidenceInput,
} from "@/lib/services/safety-case.service";
import { createAuditLog } from "@/lib/services/audit.service";
import { shareBookingPaymentInstructionsSchema } from "@/lib/validations/communication.schema";

export async function startInquiryAction(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to message the host" };
  try {
    const conversation = await ensureInquiryConversation(
      listingId,
      session.user.id
    );
    return { conversationId: conversation.id };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not start the conversation",
    };
  }
}

/**
 * Hosts may send bank-transfer or payment-link instructions only after a booking is
 * accepted and confirmed. The service re-checks ownership and booking state inside
 * its transaction; this action deliberately returns and audits identifiers only.
 */
export async function shareBookingPaymentInstructionsAction(input: unknown) {
  const parsed = shareBookingPaymentInstructionsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid payment instructions" };
  }

  try {
    const host = await requireHost();
    // `requireHost` intentionally lets administrators use host management tools. This
    // payment surface is owner-host only; the service then also checks listing ownership.
    if (!host.isHost) return { error: "Host access required" };

    const message = await shareBookingPaymentInstructions({
      bookingId: parsed.data.bookingId,
      body: parsed.data.body,
      sourceLocale: parsed.data.sourceLocale,
      clientId: parsed.data.clientId,
      dueAt: parsed.data.dueDate
        ? new Date(`${parsed.data.dueDate}T00:00:00.000Z`)
        : null,
      hostId: host.id,
    });
    await createAuditLog({
      userId: host.id,
      action: "booking.payment_instructions_shared",
      entityType: "Message",
      entityId: message.id,
      metadata: { kind: "PAYMENT_INSTRUCTIONS" },
    });
    revalidatePath("/host/bookings");
    revalidatePath(`/host/bookings/${parsed.data.bookingId}`);
    revalidatePath(`/host/reservations/${parsed.data.bookingId}`);
    revalidatePath("/messages");
    revalidatePath(`/messages/${message.conversationId}`);
    return { messageId: message.id, kind: "PAYMENT_INSTRUCTIONS" as const };
  } catch {
    // Keep action failures independent of the user-supplied payment text.
    return { error: "Could not share payment instructions" };
  }
}

export async function submitSafetyCaseAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Sign in to submit a report or claim" };
  }

  let evidence: SafetyCaseEvidenceInput[] = [];
  const evidenceJson = formData.get("evidence");
  if (typeof evidenceJson === "string" && evidenceJson.trim()) {
    try {
      evidence = JSON.parse(evidenceJson) as SafetyCaseEvidenceInput[];
    } catch {
      return { error: "The evidence list could not be read" };
    }
  }

  try {
    const safetyCase = await createSafetyCase({
      reporterId: session.user.id,
      type: String(formData.get("type") ?? "") as SafetyCaseType,
      targetType: String(
        formData.get("targetType") ?? ""
      ) as SafetyCaseTargetType,
      category: String(formData.get("category") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      description: String(formData.get("description") ?? ""),
      listingId: String(formData.get("listingId") ?? "") || undefined,
      bookingId: String(formData.get("bookingId") ?? "") || undefined,
      messageId: String(formData.get("messageId") ?? "") || undefined,
      reportedUserId:
        String(formData.get("reportedUserId") ?? "") || undefined,
      evidence,
      claimKind: String(formData.get("claimKind") ?? "") as ClaimKind,
      requestedAmount: Number(formData.get("requestedAmount")),
      currency: String(formData.get("currency") ?? "EUR"),
    });
    revalidatePath("/account/support");
    revalidatePath("/admin/cases");
    return { caseId: safetyCase.id, reference: safetyCase.reference };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not submit the case",
    };
  }
}

export async function releaseClaimToRecipientAction(caseId: string) {
  const admin = await requireAdmin();
  try {
    await releaseClaimToRecipient({ caseId, adminId: admin.id });
    revalidatePath("/admin/cases");
    revalidatePath(`/admin/cases/${caseId}`);
    revalidatePath("/account/support");
    revalidatePath(`/account/support/${caseId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not release the claim",
    };
  }
}

export async function respondToClaimAction(input: {
  caseId: string;
  response: "ACCEPT" | "REJECT" | "COUNTER";
  note?: string;
  counterAmount?: number;
}) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to respond" };
  try {
    await respondToClaim({ ...input, userId: session.user.id });
    revalidatePath("/account/support");
    revalidatePath(`/account/support/${input.caseId}`);
    revalidatePath("/admin/cases");
    revalidatePath(`/admin/cases/${input.caseId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not send your response",
    };
  }
}

export async function addSafetyCaseReplyAction(caseId: string, body: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to reply" };
  try {
    await addUserSafetyCaseUpdate({
      caseId,
      userId: session.user.id,
      body,
    });
    revalidatePath(`/account/support/${caseId}`);
    revalidatePath(`/admin/cases/${caseId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not send reply",
    };
  }
}

export async function updateSafetyCaseAdminAction(input: {
  caseId: string;
  status: SafetyCaseStatus;
  priority: SafetyCasePriority;
  note?: string;
  internal?: boolean;
  resolution?: string;
  assignToSelf?: boolean;
}) {
  const admin = await requireAdmin();
  try {
    await updateSafetyCaseByAdmin({ ...input, adminId: admin.id });
    revalidatePath("/admin/cases");
    revalidatePath(`/admin/cases/${input.caseId}`);
    revalidatePath(`/account/support/${input.caseId}`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not update the case",
    };
  }
}

export async function joinConversationAsSupportAction(conversationId: string) {
  const admin = await requireAdmin();
  try {
    await joinConversationAsSupport(conversationId, admin.id);
    await createAuditLog({
      userId: admin.id,
      action: "conversation.support_join",
      entityType: "Conversation",
      entityId: conversationId,
    });
    revalidatePath(`/admin/communications/${conversationId}`);
    revalidatePath(`/messages/${conversationId}`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not join the conversation",
    };
  }
}
