import { z } from "zod";
import { compareYmd, isValidYmd, todayYmd } from "@/lib/utils/date-only";
import {
  bookingStayRequestIssueMessage,
  classifyBookingStayRequest,
} from "@/lib/utils/booking-stay-request";
import { PAYMENT_METHOD_CODES } from "@/lib/payments/payment-methods";
import { BOOKING_PARTY_COUNT_MAX } from "@/lib/booking-party";

/** One of the three counters that may legitimately be zero. */
const partyCountSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(BOOKING_PARTY_COUNT_MAX);

export const createBookingSchema = z
  .object({
    listingId: z.string().min(1),
    /**
     * The stay, one of two ways — see `@/lib/utils/booking-stay-request`.
     *
     * All three are optional *here* because which pair is required depends on which the
     * request chose, and a field-level `required` cannot see the other fields. The
     * either/or itself is enforced by the refinement below, before any date rule runs.
     */
    checkIn: z.string().refine(isValidYmd, "Invalid date format").optional(),
    checkOut: z.string().refine(isValidYmd, "Invalid date format").optional(),
    /**
     * One of the whole stays the host offers. Carries no dates and no length: what the
     * period *is* is read from the database inside the booking transaction, so a
     * request cannot name a stay and then describe it differently.
     */
    fixedStayPeriodId: z.string().min(1).optional(),
    /**
     * The party, as four separate numbers.
     *
     * `guestCount` is deliberately absent: it is adults + children and the server
     * derives it, so a request cannot claim a party of six and a capacity of one. The
     * booking's stored `guestCount` still means exactly what it always meant.
     *
     * At least one adult, always. Infants and pets cannot hold a booking, and a
     * "party" made only of them has nobody the stay is for.
     */
    adults: z.coerce
      .number()
      .int()
      .min(1, "Add at least one adult to the booking.")
      .max(BOOKING_PARTY_COUNT_MAX),
    children: partyCountSchema.optional().default(0),
    infants: partyCountSchema.optional().default(0),
    pets: partyCountSchema.optional().default(0),
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
  .refine((data) => data.adults + data.children <= BOOKING_PARTY_COUNT_MAX, {
    message: `Maximum ${BOOKING_PARTY_COUNT_MAX} guests allowed`,
    path: ["adults"],
  })
  // The either/or, before either date rule below: a request that has not said what it is
  // booking has no dates worth measuring, and one that sent a period *and* a date must
  // not have the date quietly validated as though it counted.
  .superRefine((data, ctx) => {
    const classification = classifyBookingStayRequest(data);
    if ("issue" in classification) {
      ctx.addIssue({
        code: "custom",
        path: classification.issue === "MIXED_SELECTION" ? ["fixedStayPeriodId"] : ["checkIn"],
        message: bookingStayRequestIssueMessage(classification.issue),
      });
    }
  })
  // The marketplace's day, not the server's. `format(new Date(), ...)` read the host
  // process's clock, so a container in UTC refused a stay starting today for the first
  // two hours of every Skopje morning — while the browser's date picker, which follows
  // the same shared rule this now does, was still offering it (M6).
  .refine(
    (data) => !data.checkIn || compareYmd(data.checkIn, todayYmd()) >= 0,
    {
      message: "Check-in date cannot be in the past",
      path: ["checkIn"],
    },
  )
  .refine(
    (data) =>
      !data.checkIn || !data.checkOut || compareYmd(data.checkOut, data.checkIn) > 0,
    {
      message: "Check-out date must be after check-in date",
      path: ["checkOut"],
    },
  );

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * The structured fields a host reviewed before sending.
 *
 * Deliberately loose here — keys and values are only shaped enough to be safe to carry.
 * What a field means, whether it is required, and whether its value is a real IBAN is
 * decided by the payment-details validator on the server, against the method this
 * booking actually uses. A client cannot shortcut that by posting a tidy-looking object.
 */
const paymentDetailFieldsSchema = z.record(
  z.string().trim().min(1).max(40),
  z.string().max(500),
);

/**
 * Both host transports post this: the web dialog through its server action, and the
 * mobile PATCH route. `decision` has no default here and none downstream — an
 * acceptance that does not say what happens to the payment instructions is refused
 * rather than guessed at from the payment method (M1).
 */
export const acceptBookingWithPaymentSchema = z.object({
  bookingId: z.string().trim().min(1),
  decision: z.enum(["SEND_NOW", "SEND_LATER", "NO_INSTRUCTIONS"], {
    message: "Choose what happens with payment instructions before accepting.",
  }),
  instructions: z.string().trim().max(1200).optional(),
  detailFields: paymentDetailFieldsSchema.optional(),
  /** Only honoured for a booking whose guest never chose a method. */
  method: z.enum(PAYMENT_METHOD_CODES).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid payment deadline")
    .optional(),
  saveForFuture: z.boolean().optional().default(false),
  /**
   * Send the details the host already reviewed and saved for this booking's method,
   * resolved server-side. The mobile sheet previews that exact text before the host
   * taps, so the send is still reviewed without the phone ever holding the host's
   * private coordinates.
   */
  useSavedInstructions: z.boolean().optional().default(false),
});

export const sendBookingPaymentRequestSchema = z
  .object({
    bookingId: z.string().trim().min(1),
    paymentRequestId: z.string().trim().min(1).optional(),
    instructions: z.string().trim().max(1200).optional(),
    detailFields: paymentDetailFieldsSchema.optional(),
    method: z.enum(PAYMENT_METHOD_CODES).optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid payment deadline"),
    saveForFuture: z.boolean().optional().default(false),
  })
  .refine(
    (data) =>
      Boolean(data.instructions?.trim()) ||
      Object.values(data.detailFields ?? {}).some((value) => value.trim() !== ""),
    { message: "Add the payment details before sending.", path: ["instructions"] },
  );
