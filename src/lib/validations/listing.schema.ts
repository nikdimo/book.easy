import { z } from "zod";
import {
  ADDITIONAL_RULES_MAX,
  EVENT_POLICIES,
  PET_POLICIES,
  QUIET_HOURS_POLICIES,
  SMOKING_POLICIES,
} from "@/lib/host/v2/listing-house-rules";

/** Any wall-clock minute, or "" / absent for "flexible". Anything that is not a time at
 *  all is normalised away rather than rejected — a stale draft or an older mobile client
 *  sending a value this build no longer offers should still be able to publish.
 *
 *  Deliberately every minute rather than the picker's half hours: a listing imported
 *  from Airbnb can arrive holding "14:15", the editor and the create flow both keep that
 *  value selectable, and rounding it to "" at publish would drop an arrival time the
 *  host was shown and agreed to on the screen before. Same pattern the host-side rules
 *  module uses. */
const stayTime = z
  .string()
  .optional()
  .transform((value) => (value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : ""));

/** One house-rules policy on the way in from a form. Absent, "" and anything outside
 *  the set all mean the same thing — the host has not answered — and publish stores
 *  NULL for it rather than inventing a refusal. */
function policy<T extends string>(choices: readonly T[]) {
  return z
    .string()
    .optional()
    .transform((value) =>
      value && (choices as readonly string[]).includes(value) ? (value as T) : null,
    );
}

export const listingFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100),
  description: z.string().min(20, "Description must be at least 20 characters").max(5000),
  propertyType: z.string().min(1, "Property type is required"),
  spaceType: z
    .enum(["ENTIRE_PLACE", "PRIVATE_ROOM", "SHARED_ROOM", "HOTEL_ROOM"])
    .default("ENTIRE_PLACE"),
  address: z.string().min(3, "Address is required"),
  city: z.string().min(2, "City is required"),
  area: z.string().optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().min(2, "Country is required"),
  latitude: z.coerce
    .number({ error: "Confirm the exact location on the map" })
    .min(-90)
    .max(90),
  longitude: z.coerce
    .number({ error: "Confirm the exact location on the map" })
    .min(-180)
    .max(180),
  locationSource: z
    .string()
    .min(1, "Confirm the exact location on the map")
    .max(30),
  locationConfirmed: z
    .string()
    .refine((value) => value === "true", {
      message: "Confirm the exact location on the map",
    }),
  geocodingProvider: z.string().max(30).optional(),
  geocodingPlaceId: z.string().max(500).optional(),
  geocodingConfidence: z.coerce.number().min(0).max(1).optional(),
  streetViewHeading: z.coerce.number().min(-180).max(360).optional(),
  streetViewPitch: z.coerce.number().min(-90).max(90).optional(),
  streetViewPanoId: z.string().max(500).optional(),
  maxGuests: z.coerce.number().int().min(1).max(20),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  beds: z.coerce.number().int().min(0).max(40),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Choose a valid currency"),
  baseNightlyRate: z.coerce.number().min(1, "Nightly rate is required"),
  cleaningFee: z.coerce.number().min(0).default(0),
  minNights: z.coerce.number().int().min(1).default(1),
  // "HH:MM" on a 24-hour clock, or "" for a host who stays flexible. Never required:
  // the form pre-fills both, so an empty value here is a deliberate choice rather than
  // an unfinished field, and publishing must not stall on it.
  checkInTime: stayTime,
  checkOutTime: stayTime,
  // The structured house rules. Never required: a listing created by the mobile app or
  // by an older draft has never been asked these, and publishing must not stall on a
  // question that was not on the screen. The create flow requires them at the step that
  // asks, which is where the host can actually answer.
  petPolicy: policy(PET_POLICIES),
  smokingPolicy: policy(SMOKING_POLICIES),
  eventPolicy: policy(EVENT_POLICIES),
  quietHoursPolicy: policy(QUIET_HOURS_POLICIES),
  quietHoursStart: stayTime,
  quietHoursEnd: stayTime,
  additionalRules: z
    .string()
    .max(ADDITIONAL_RULES_MAX, "Your additional house rules are too long")
    .optional()
    .transform((value) => (value ? value.trim() : "")),
  amenityIds: z.array(z.string()).optional(),
});

export type ListingFormInput = z.infer<typeof listingFormSchema>;
