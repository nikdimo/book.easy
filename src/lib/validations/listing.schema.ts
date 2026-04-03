import { z } from "zod";

export const listingFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100),
  description: z.string().min(20, "Description must be at least 20 characters").max(5000),
  propertyType: z.string().min(1, "Property type is required"),
  address: z.string().min(3, "Address is required"),
  city: z.string().min(2, "City is required"),
  area: z.string().optional(),
  country: z.string().default("North Macedonia"),
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
