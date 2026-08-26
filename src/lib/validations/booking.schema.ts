import { z } from "zod";
import { format } from "date-fns";
import { compareYmd } from "@/lib/utils/date-only";
import { PAYMENT_METHOD_CODES } from "@/lib/payments/payment-methods";

export const createBookingSchema = z
  .object({
    listingId: z.string().min(1),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
    guestCount: z.coerce.number().int().min(1).max(20),
    guestNote: z.string().max(1000).optional(),
    selectedPaymentMethod: z.enum(PAYMENT_METHOD_CODES).optional(),
    /**
     * The guest's explicit acceptance of the listing's house rules.
     *
     * A literal "true" and nothing else: this is the one field on the request that is a
     * statement about the guest rather than about their stay, and a missing or falsy
     * value has to fail rather than default. Note what it is *not* — a copy of the rules
     * themselves. What the guest agreed to is read from the listing on the server, so a
     * crafted request cannot book a stay under rules of its own choosing.
     */
    houseRulesAccepted: z.literal("true", {
      error: "Please agree to the house rules before you send your request.",
    }),
    /** Opaque fingerprint of the exact rules shown beside the acceptance checkbox. */
    houseRulesVersion: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "The house rules could not be verified. Reload and try again."),
  })
  .refine((data) => compareYmd(data.checkIn, format(new Date(), "yyyy-MM-dd")) >= 0, {
    message: "Check-in date cannot be in the past",
    path: ["checkIn"],
  })
  .refine((data) => compareYmd(data.checkOut, data.checkIn) > 0, {
    message: "Check-out date must be after check-in date",
    path: ["checkOut"],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const acceptBookingWithPaymentSchema = z.object({
  bookingId: z.string().trim().min(1),
  decision: z.enum(["SEND_NOW", "SEND_LATER", "NO_INSTRUCTIONS"]),
  instructions: z.string().trim().max(1200).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid payment deadline")
    .optional(),
  saveForFuture: z.boolean().optional().default(false),
});

export const sendBookingPaymentRequestSchema = z.object({
  bookingId: z.string().trim().min(1),
  instructions: z.string().trim().min(1).max(1200),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid payment deadline"),
  saveForFuture: z.boolean().optional().default(false),
});
