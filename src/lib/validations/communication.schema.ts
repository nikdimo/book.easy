import { z } from "zod";

export const conversationStartSchema = z
  .object({
    bookingId: z.string().trim().min(1).optional(),
    listingId: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.bookingId) !== Boolean(value.listingId), {
    message: "Provide either a booking or a listing",
  });

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(2000),
  clientId: z.string().uuid("Invalid message ID"),
});

export const shareBookingPaymentInstructionsSchema = z.object({
  bookingId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(2000),
  sourceLocale: z.string().trim().min(1).max(35).optional(),
  clientId: z.string().uuid("Invalid message ID").optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const markConversationReadSchema = z.object({
  lastMessageId: z.string().trim().min(1),
});

export const damageEvidenceSchema = z.object({
  url: z.string().startsWith("/uploads/"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});

export const damageReportSchema = z.object({
  description: z.string().trim().min(10).max(3000),
  evidence: z.array(damageEvidenceSchema).min(1).max(5),
});

export const damageReportUpdateSchema = z.object({
  action: z.enum(["ACKNOWLEDGE", "ESCALATE", "RESOLVE"]),
});
