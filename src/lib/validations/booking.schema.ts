import { z } from "zod";
import { format } from "date-fns";
import { compareYmd } from "@/lib/utils/date-only";

export const createBookingSchema = z
  .object({
    listingId: z.string().min(1),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
    guestCount: z.coerce.number().int().min(1).max(20),
    guestNote: z.string().max(1000).optional(),
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
