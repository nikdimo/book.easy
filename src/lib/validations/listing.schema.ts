import { z } from "zod";

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
  maxGuests: z.coerce.number().int().min(1).max(20),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  beds: z.coerce.number().int().min(0).max(40),
  baseNightlyRate: z.coerce.number().min(1, "Nightly rate is required"),
  cleaningFee: z.coerce.number().min(0).default(0),
  minNights: z.coerce.number().int().min(1).default(1),
  amenityIds: z.array(z.string()).optional(),
});

export type ListingFormInput = z.infer<typeof listingFormSchema>;
