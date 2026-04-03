"use client";

import { useActionState } from "react";
import { createListing, updateListing } from "@/lib/actions/listing.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROPERTY_TYPES } from "@/lib/constants";
import { toast } from "sonner";
import { ListingImagesField } from "@/components/host/listing-images-field";
import type { HostListingFormData } from "@/lib/serializers/host-listing-form";

interface ListingFormProps {
  amenities: { id: string; name: string; category: string }[];
  initialImageUrls?: string[];
  /** Serialized from the server (no Prisma Decimal). */
  listing?: HostListingFormData;
}

export function ListingForm({ amenities, listing, initialImageUrls = [] }: ListingFormProps) {
  const isEditing = !!listing;
  const selectedAmenityIds = listing?.amenities.map((a) => a.amenityId) || [];

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      const result = isEditing
        ? await updateListing(listing!.id, formData)
        : await createListing(formData);
      if (result && "success" in result && result.success) {
        toast.success(isEditing ? "Listing updated" : "Listing created");
      }
      if (result && "error" in result) toast.error(result.error);
      return result;
    },
    undefined
  );

  const grouped = amenities.reduce(
    (acc, a) => {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    },
    {} as Record<string, typeof amenities>
  );

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {state.error}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={listing?.title} required placeholder="A catchy title for your listing" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={listing?.description} required rows={6} placeholder="Describe your place, the neighbourhood, and what makes it special..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="propertyType">Property type</Label>
            <select id="propertyType" name="propertyType" defaultValue={listing?.property.propertyType} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              <option value="">Select type</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Location</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" defaultValue={listing?.property.address} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={listing?.property.city} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">Area / Neighbourhood</Label>
              <Input id="area" name="area" defaultValue={listing?.property.area || ""} />
            </div>
          </div>
          <input type="hidden" name="country" value={listing?.property.country || "North Macedonia"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Photos</CardTitle></CardHeader>
        <CardContent>
          <ListingImagesField initialUrls={initialImageUrls} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Capacity</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxGuests">Max guests</Label>
              <Input id="maxGuests" name="maxGuests" type="number" min="1" defaultValue={listing?.maxGuests || 1} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input id="bedrooms" name="bedrooms" type="number" min="0" defaultValue={listing?.bedrooms || 1} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beds">Beds</Label>
              <Input id="beds" name="beds" type="number" min="0" defaultValue={listing?.beds || 1} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input id="bathrooms" name="bathrooms" type="number" min="0" defaultValue={listing?.bathrooms || 1} required />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="baseNightlyRate">Nightly rate (EUR)</Label>
              <Input id="baseNightlyRate" name="baseNightlyRate" type="number" min="1" step="0.01" defaultValue={listing?.pricingRule ? listing.pricingRule.baseNightlyRate : ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaningFee">Cleaning fee (EUR)</Label>
              <Input id="cleaningFee" name="cleaningFee" type="number" min="0" step="0.01" defaultValue={listing?.pricingRule ? listing.pricingRule.cleaningFee : 0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minNights">Minimum nights</Label>
              <Input id="minNights" name="minNights" type="number" min="1" defaultValue={listing?.pricingRule?.minNights || 1} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Amenities</CardTitle></CardHeader>
        <CardContent>
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">{category}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {items.map((amenity) => (
                  <label key={amenity.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      name="amenityIds"
                      value={amenity.id}
                      defaultChecked={selectedAmenityIds.includes(amenity.id)}
                    />
                    {amenity.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending
          ? isEditing ? "Saving..." : "Creating..."
          : isEditing ? "Save Changes" : "Create Listing"
        }
      </Button>
    </form>
  );
}
