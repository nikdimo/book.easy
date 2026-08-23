import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";

export const BEDROOMS_MAX = 20;
export const BEDS_MAX = 40;
export const BATHROOMS_MAX = 20;

export interface ListingPropertyDetailsInput {
  propertyType: string;
  spaceType: ListingSpaceTypeValue;
  bedrooms: number;
  beds: number;
  bathrooms: number;
}

export type PropertyDetailsField = keyof ListingPropertyDetailsInput;
export type PropertyDetailsIssue = "REQUIRED" | "INVALID" | "OUT_OF_RANGE";
export type ListingPropertyDetailsIssues = Partial<Record<PropertyDetailsField, PropertyDetailsIssue>>;

export function listingPropertyDetailsIssues(input: ListingPropertyDetailsInput): ListingPropertyDetailsIssues {
  const issues: ListingPropertyDetailsIssues = {};
  if (!input.propertyType.trim()) issues.propertyType = "REQUIRED";
  if (!["ENTIRE_PLACE", "PRIVATE_ROOM", "SHARED_ROOM", "HOTEL_ROOM"].includes(input.spaceType)) issues.spaceType = "INVALID";
  for (const [field, max] of [["bedrooms", BEDROOMS_MAX], ["beds", BEDS_MAX], ["bathrooms", BATHROOMS_MAX]] as const) {
    const value = input[field];
    if (!Number.isInteger(value)) issues[field] = "INVALID";
    else if (value < 0 || value > max) issues[field] = "OUT_OF_RANGE";
  }
  return issues;
}

export function listingPropertyDetailsComplete(input: ListingPropertyDetailsInput): boolean {
  return Object.keys(listingPropertyDetailsIssues(input)).length === 0;
}

export interface ListingPropertyDetailsSaveResult {
  error?: string;
  issues?: ListingPropertyDetailsIssues;
  stored?: ListingPropertyDetailsInput;
  complete?: boolean;
}
