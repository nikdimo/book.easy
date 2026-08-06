import { z } from "zod";

/** A half-hour slot on a 24-hour clock, or "" / absent for "flexible". Anything else
 *  is normalised away rather than rejected — a stale draft or an older mobile client
 *  sending a value this build no longer offers should still be able to publish. */
const stayTime = z
  .string()
  .optional()
  .transform((value) => (value && /^([01]\d|2[0-3]):(00|30)$/.test(value) ? value : ""));

export const listingFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100),
  description: z.string().min(20, "Description must be at least 20 characters").max(5000),
  propertyType: z.string().min(1, "Property type is required"),
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
  amenityIds: z.array(z.string()).optional(),
});

export type ListingFormInput = z.infer<typeof listingFormSchema>;
