"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bath, Bed, BedDouble, MapPin, ShieldCheck, Users } from "lucide-react";
import {
  saveListingDraft,
  submitNewListing,
  updateListing,
} from "@/lib/actions/listing.actions";
import { listingFormSchema } from "@/lib/validations/listing.schema";
import { zodFieldErrors } from "@/lib/utils/zod-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils/format";
import { toast } from "sonner";
import { ListingImagesField } from "@/components/host/listing-images-field";
import { ListingLocationField } from "@/components/host/listing-location-field";
import { SuggestMissingOption } from "@/components/host/suggest-missing-option";
import type { HostListingFormData } from "@/lib/serializers/host-listing-form";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { ListingDraftData } from "@/lib/types/listing-draft";

interface ListingFormProps {
  amenities: { id: string; name: string; category: string }[];
  propertyTypes: PropertyTypeOption[];
  availableCities?: string[];
  initialImageUrls?: string[];
  /** Serialized from the server (no Prisma Decimal). */
  listing?: HostListingFormData;
  /** Resuming an autosaved in-progress draft of a listing that was never submitted. */
  draftId?: string;
  initialDraft?: ListingDraftData;
}

type ListingFormValues = {
  title: string;
  description: string;
  propertyType: string;
  address: string;
  city: string;
  area: string;
  maxGuests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  baseNightlyRate: string;
  cleaningFee: string;
  minNights: string;
};

const FALLBACK_TITLE = "Your listing title";
const FALLBACK_DESCRIPTION =
  "Describe the space, the neighborhood, and the details guests should know before booking.";

function toPositiveNumber(value: string, fallback: number) {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function listingInitialValues(
  listing?: HostListingFormData,
  draft?: ListingDraftData
): ListingFormValues {
  if (listing) {
    return {
      title: listing.title,
      description: listing.description,
      propertyType: listing.property.propertyType,
      address: listing.property.address,
      city: listing.property.city,
      area: listing.property.area ?? "",
      maxGuests: String(listing.maxGuests),
      bedrooms: String(listing.bedrooms),
      beds: String(listing.beds),
      bathrooms: String(listing.bathrooms),
      baseNightlyRate: listing.pricingRule ? String(listing.pricingRule.baseNightlyRate) : "",
      cleaningFee: listing.pricingRule ? String(listing.pricingRule.cleaningFee) : "0",
      minNights: listing.pricingRule ? String(listing.pricingRule.minNights) : "1",
    };
  }

  return {
    title: draft?.title ?? "",
    description: draft?.description ?? "",
    propertyType: draft?.propertyType ?? "",
    address: draft?.address ?? "",
    city: draft?.city ?? "",
    area: draft?.area ?? "",
    maxGuests: draft?.maxGuests || "2",
    bedrooms: draft?.bedrooms || "1",
    beds: draft?.beds || "1",
    bathrooms: draft?.bathrooms || "1",
    baseNightlyRate: draft?.baseNightlyRate ?? "",
    cleaningFee: draft?.cleaningFee || "0",
    minNights: draft?.minNights || "1",
  };
}

/** Subset of listingFormSchema's rules worth showing inline, as-you-go, rather than
 * only after a full submit attempt. */
const FIELD_VALIDATORS: Partial<Record<keyof ListingFormValues, (value: string) => string | null>> = {
  title: (v) => (v.trim().length < 5 ? "Title must be at least 5 characters" : null),
  description: (v) =>
    v.trim().length < 20 ? "Description must be at least 20 characters" : null,
  propertyType: (v) => (v ? null : "Property type is required"),
  address: (v) => (v.trim().length < 3 ? "Address is required" : null),
  city: (v) => (v.trim().length < 2 ? "City is required" : null),
  baseNightlyRate: (v) =>
    !v || Number(v) < 1 ? "Nightly rate is required" : null,
};

function FieldSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-b border-border/70 pb-6 last:border-b-0 last:pb-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ListingForm({
  amenities,
  propertyTypes,
  availableCities = [],
  listing,
  initialImageUrls = [],
  draftId: initialDraftId,
  initialDraft,
}: ListingFormProps) {
  const isEditing = !!listing;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ListingFormValues>(() =>
    listingInitialValues(listing, initialDraft)
  );
  const [imageUrls, setImageUrls] = useState<string[]>(
    initialImageUrls.length > 0 ? initialImageUrls : (initialDraft?.imageUrls ?? [])
  );
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>(
    () => listing?.amenities.map((a) => a.amenityId) ?? initialDraft?.amenityIds ?? []
  );
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submittedListingId, setSubmittedListingId] = useState<string | null>(null);
  const [isSubmittingNew, startSubmitNewTransition] = useTransition();

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      const result = await updateListing(listing!.id, formData);
      if (result && "success" in result && result.success) {
        toast.success("Listing updated");
      }
      if (result && "error" in result) toast.error(result.error);
      return result;
    },
    undefined
  );

  // Silently persists in-progress form state for a listing that hasn't been submitted
  // yet, so leaving the page (or the tab crashing) doesn't lose it. Not validated —
  // partial/empty values are expected. No-op once editing a real listing, which is
  // already persisted.
  function autosaveDraft() {
    if (isEditing || !formRef.current) return;
    const fd = new FormData(formRef.current);
    void saveListingDraft(draftId, fd).then((result) => {
      if (result && "draftId" in result) setDraftId(result.draftId);
    });
  }

  const groupedAmenities = useMemo(
    () =>
      amenities.reduce(
        (acc, amenity) => {
          if (!acc[amenity.category]) acc[amenity.category] = [];
          acc[amenity.category].push(amenity);
          return acc;
        },
        {} as Record<string, typeof amenities>
      ),
    [amenities]
  );

  const selectedAmenities = useMemo(
    () => amenities.filter((amenity) => selectedAmenityIds.includes(amenity.id)),
    [amenities, selectedAmenityIds]
  );

  function setField(field: keyof ListingFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function validateFieldOnBlur(field: keyof ListingFormValues, value: string) {
    const validator = FIELD_VALIDATORS[field];
    if (!validator) return;
    const message = validator(value);
    setFieldErrors((current) => {
      if (!message) {
        if (!(field in current)) return current;
        const next = { ...current };
        delete next[field];
        return next;
      }
      return { ...current, [field]: message };
    });
  }

  function handleBlur(field: keyof ListingFormValues) {
    validateFieldOnBlur(field, values[field]);
    autosaveDraft();
  }

  function handleImageUrlsChange(next: string[] | ((current: string[]) => string[])) {
    setImageUrls(next);
    setFieldErrors((current) => {
      if (!("images" in current)) return current;
      const rest = { ...current };
      delete rest.images;
      return rest;
    });
    // Runs after the state update above has been queued — imageUrls changes come from
    // discrete user actions (upload/remove/reorder), not continuous typing, so saving
    // immediately (rather than waiting for some unrelated field's blur) is appropriate.
    setTimeout(autosaveDraft, 0);
  }

  function toggleAmenity(amenityId: string, checked: boolean) {
    setSelectedAmenityIds((current) =>
      checked ? [...current, amenityId] : current.filter((id) => id !== amenityId)
    );
    setTimeout(autosaveDraft, 0);
  }

  const typeLabel = propertyTypes.find((type) => type.value === values.propertyType)?.label;
  const guests = toPositiveNumber(values.maxGuests, 2);
  const bedrooms = toPositiveNumber(values.bedrooms, 1);
  const beds = toPositiveNumber(values.beds, 1);
  const bathrooms = toPositiveNumber(values.bathrooms, 1);
  const nightlyRate = toPositiveNumber(values.baseNightlyRate, 0);
  const cleaningFee = toPositiveNumber(values.cleaningFee, 0);
  const minNights = Math.max(1, toPositiveNumber(values.minNights, 1));
  const locationLine = [values.area, values.city || "City", "North Macedonia"]
    .filter(Boolean)
    .join(", ");

  function handleSubmitForReview() {
    if (!formRef.current) return;

    const parsed = listingFormSchema.safeParse({
      title: values.title,
      description: values.description,
      propertyType: values.propertyType,
      address: values.address,
      city: values.city,
      area: values.area || undefined,
      country: "North Macedonia",
      maxGuests: values.maxGuests,
      bedrooms: values.bedrooms,
      bathrooms: values.bathrooms,
      beds: values.beds,
      baseNightlyRate: values.baseNightlyRate,
      cleaningFee: values.cleaningFee || "0",
      minNights: values.minNights || "1",
    });

    const errors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (imageUrls.length === 0) {
      errors.images = "Add at least one photo before submitting for review";
    }
    setFieldErrors(errors);

    const firstErrorField = Object.keys(errors)[0];
    if (firstErrorField) {
      toast.error(errors[firstErrorField]);
      const el =
        firstErrorField === "images"
          ? document.getElementById("listing-photo-upload")
          : document.getElementById(firstErrorField);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const fd = new FormData(formRef.current);
    startSubmitNewTransition(async () => {
      const result = await submitNewListing(fd, draftId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setSubmittedListingId(result.listingId);
      }
    });
  }

  return (
    <form ref={formRef} action={isEditing ? formAction : undefined} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Build the listing exactly as guests will understand it.
            </p>
          </div>

          <FieldSection title="Guest-facing basics">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                value={values.title}
                onChange={(event) => setField("title", event.target.value)}
                onBlur={() => handleBlur("title")}
                required
                placeholder="Modern apartment near the center"
              />
              <FieldError message={fieldErrors.title} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={values.description}
                onChange={(event) => setField("description", event.target.value)}
                onBlur={() => handleBlur("description")}
                required
                rows={7}
                placeholder="Describe the stay, layout, neighborhood, and what makes it easy to book."
              />
              <div className="flex items-center justify-between">
                <FieldError message={fieldErrors.description} />
                <span
                  className={
                    values.description.trim().length < 20
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {values.description.trim().length}/20 min
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property type</Label>
              <select
                id="propertyType"
                name="propertyType"
                value={values.propertyType}
                onChange={(event) => setField("propertyType", event.target.value)}
                onBlur={() => handleBlur("propertyType")}
                required
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Select type</option>
                {propertyTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.propertyType} />
              <SuggestMissingOption
                kind="PROPERTY_TYPE"
                listingId={listing?.id}
                label="Don't see your property type? Suggest it"
                placeholder="e.g. Houseboat"
              />
            </div>
          </FieldSection>

          <FieldSection title="Location">
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                value={values.address}
                onChange={(event) => setField("address", event.target.value)}
                onBlur={() => handleBlur("address")}
                required
                placeholder="Street and building number"
              />
              <FieldError message={fieldErrors.address} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  value={values.city}
                  onChange={(event) => setField("city", event.target.value)}
                  onBlur={() => handleBlur("city")}
                  list="available-cities"
                  required
                  placeholder="Skopje"
                />
                <FieldError message={fieldErrors.city} />
                <datalist id="available-cities">
                  {availableCities.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">Area / Neighbourhood</Label>
                <Input
                  id="area"
                  name="area"
                  value={values.area}
                  onChange={(event) => setField("area", event.target.value)}
                  onBlur={() => handleBlur("area")}
                  placeholder="Debar Maalo"
                />
              </div>
            </div>
            <input type="hidden" name="country" value={listing?.property.country || "North Macedonia"} />
            <ListingLocationField
              initialLat={listing?.property.latitude ?? parseFloatOrUndefined(initialDraft?.latitude)}
              initialLng={listing?.property.longitude ?? parseFloatOrUndefined(initialDraft?.longitude)}
            />
          </FieldSection>

          <FieldSection title="Photos">
            <ListingImagesField urls={imageUrls} onUrlsChange={handleImageUrlsChange} />
            <FieldError message={fieldErrors.images} />
          </FieldSection>

          <FieldSection title="Capacity">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <NumberField
                id="maxGuests"
                label="Guests"
                value={values.maxGuests}
                min={1}
                onChange={(value) => setField("maxGuests", value)}
                onBlur={autosaveDraft}
              />
              <NumberField
                id="bedrooms"
                label="Bedrooms"
                value={values.bedrooms}
                min={0}
                onChange={(value) => setField("bedrooms", value)}
                onBlur={autosaveDraft}
              />
              <NumberField
                id="beds"
                label="Beds"
                value={values.beds}
                min={0}
                onChange={(value) => setField("beds", value)}
                onBlur={autosaveDraft}
              />
              <NumberField
                id="bathrooms"
                label="Bathrooms"
                value={values.bathrooms}
                min={0}
                onChange={(value) => setField("bathrooms", value)}
                onBlur={autosaveDraft}
              />
            </div>
          </FieldSection>

          <FieldSection title="Pricing">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <NumberField
                  id="baseNightlyRate"
                  label="Nightly rate (EUR)"
                  value={values.baseNightlyRate}
                  min={1}
                  step="0.01"
                  onChange={(value) => setField("baseNightlyRate", value)}
                  onBlur={() => handleBlur("baseNightlyRate")}
                />
                <FieldError message={fieldErrors.baseNightlyRate} />
              </div>
              <NumberField
                id="cleaningFee"
                label="Cleaning fee (EUR)"
                value={values.cleaningFee}
                min={0}
                step="0.01"
                onChange={(value) => setField("cleaningFee", value)}
                onBlur={autosaveDraft}
              />
              <NumberField
                id="minNights"
                label="Minimum nights"
                value={values.minNights}
                min={1}
                onChange={(value) => setField("minNights", value)}
                onBlur={autosaveDraft}
              />
            </div>
          </FieldSection>

          <FieldSection title="Amenities">
            <div className="space-y-5">
              {Object.entries(groupedAmenities).map(([category, items]) => (
                <div key={category}>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">{category}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {items.map((amenity) => {
                      const checked = selectedAmenityIds.includes(amenity.id);
                      return (
                        <label
                          key={amenity.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                        >
                          <Checkbox
                            name="amenityIds"
                            value={amenity.id}
                            checked={checked}
                            onCheckedChange={(next) => toggleAmenity(amenity.id, next === true)}
                          />
                          {amenity.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <SuggestMissingOption
                kind="AMENITY"
                listingId={listing?.id}
                label="Don't see an amenity? Suggest it"
                placeholder="e.g. Rooftop terrace"
              />
            </div>
          </FieldSection>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Guest booking preview
            </h2>
            <Badge variant="secondary" className="rounded-md">
              Live
            </Badge>
          </div>
          <ListingGuestPreview
            title={values.title || FALLBACK_TITLE}
            description={values.description || FALLBACK_DESCRIPTION}
            typeLabel={typeLabel}
            locationLine={locationLine}
            imageUrls={imageUrls}
            guests={guests}
            bedrooms={bedrooms}
            beds={beds}
            bathrooms={bathrooms}
            nightlyRate={nightlyRate}
            cleaningFee={cleaningFee}
            minNights={minNights}
            amenities={selectedAmenities}
          />
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        {isEditing ? (
          <Button type="submit" size="lg" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={isSubmittingNew}
            onClick={handleSubmitForReview}
            className="w-full sm:w-auto"
          >
            {isSubmittingNew ? "Submitting..." : "Submit for Review"}
          </Button>
        )}
      </div>

      <Dialog
        open={!!submittedListingId}
        onOpenChange={(open) => {
          if (!open && submittedListingId) {
            router.push(`/host/listings/${submittedListingId}/edit`);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submitted for review</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              Thanks! Your listing has been sent for review — this usually takes 1 to 24
              hours. Questions? Contact{" "}
              <a href="mailto:hello@book.easy.mk" className="underline underline-offset-2">
                hello@book.easy.mk
              </a>
              .
            </DialogDescription>
          </DialogHeader>
          <Button
            onClick={() => {
              if (submittedListingId) router.push(`/host/listings/${submittedListingId}/edit`);
            }}
          >
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function parseFloatOrUndefined(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function NumberField({
  id,
  label,
  value,
  min,
  step,
  onChange,
  onBlur,
}: {
  id: keyof ListingFormValues;
  label: string;
  value: string;
  min: number;
  step?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        required={id !== "cleaningFee"}
      />
    </div>
  );
}

function ListingGuestPreview({
  title,
  description,
  typeLabel,
  locationLine,
  imageUrls,
  guests,
  bedrooms,
  beds,
  bathrooms,
  nightlyRate,
  cleaningFee,
  minNights,
  amenities,
}: {
  title: string;
  description: string;
  typeLabel?: string;
  locationLine: string;
  imageUrls: string[];
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  nightlyRate: number;
  cleaningFee: number;
  minNights: number;
  amenities: { id: string; name: string; category: string }[];
}) {
  const displayedImages = imageUrls.slice(0, 5);
  const sampleNights = Math.max(minNights, 2);
  const sampleSubtotal = nightlyRate * sampleNights;
  const sampleTotal = sampleSubtotal + cleaningFee;

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold leading-tight tracking-tight md:text-2xl">
              {title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{locationLine}</span>
              </span>
              {typeLabel && (
                <Badge variant="secondary" className="rounded-md font-normal">
                  {typeLabel}
                </Badge>
              )}
            </div>
          </div>
          <Badge variant="outline" className="rounded-md">
            Preview
          </Badge>
        </div>

        <PreviewGallery imageUrls={displayedImages} />

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/80 pb-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {guests} guests
              </span>
              <span className="flex items-center gap-1.5">
                <BedDouble className="h-4 w-4" />
                {bedrooms} bedrooms
              </span>
              <span className="flex items-center gap-1.5">
                <Bed className="h-4 w-4" />
                {beds} beds
              </span>
              <span className="flex items-center gap-1.5">
                <Bath className="h-4 w-4" />
                {bathrooms} baths
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full border-2 border-border bg-muted text-sm font-semibold">
                BE
              </div>
              <div>
                <p className="font-semibold">Hosted by Book Easy</p>
                <p className="text-sm text-muted-foreground">Fast replies and local support.</p>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="mb-3 text-lg font-semibold">About this space</h4>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>

            {amenities.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-3 text-lg font-semibold">What this place offers</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {amenities.slice(0, 8).map((amenity) => (
                      <div key={amenity.id} className="flex items-center gap-2 text-sm">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        {amenity.name}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border-2 border-border p-4 shadow-lg">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold">
                {nightlyRate > 0 ? formatPrice(nightlyRate) : "EUR"}
              </span>
              <span className="text-sm text-muted-foreground">/ night</span>
            </div>
            <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border text-xs">
              <div className="border-r p-3">
                <p className="font-semibold uppercase">Check-in</p>
                <p className="mt-1 text-muted-foreground">Select date</p>
              </div>
              <div className="p-3">
                <p className="font-semibold uppercase">Check-out</p>
                <p className="mt-1 text-muted-foreground">Select date</p>
              </div>
              <div className="col-span-2 border-t p-3">
                <p className="font-semibold uppercase">Guests</p>
                <p className="mt-1 text-muted-foreground">1 guest</p>
              </div>
            </div>
            <Button type="button" className="mt-4 w-full py-5 text-base font-semibold" disabled>
              Reserve
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Guests will not be charged yet.
            </p>
            {nightlyRate > 0 && (
              <div className="mt-4 space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between gap-2">
                  <span>
                    {formatPrice(nightlyRate)} x {sampleNights} nights
                  </span>
                  <span>{formatPrice(sampleSubtotal)}</span>
                </div>
                {cleaningFee > 0 && (
                  <div className="flex justify-between gap-2">
                    <span>Cleaning fee</span>
                    <span>{formatPrice(cleaningFee)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatPrice(sampleTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewGallery({ imageUrls }: { imageUrls: string[] }) {
  if (imageUrls.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground ring-1 ring-black/5">
        Photos will appear here
      </div>
    );
  }

  const [cover, ...gridImages] = imageUrls;

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-black/5">
      <div className="grid max-h-[360px] grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted md:col-span-2 md:row-span-2 md:aspect-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="h-full w-full object-cover" />
        </div>
        {gridImages.map((url, index) => (
          <div key={`${url}-${index}`} className="relative hidden aspect-[4/3] overflow-hidden bg-muted md:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}
