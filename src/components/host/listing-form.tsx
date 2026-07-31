"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bath, Bed, BedDouble, Building, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, CircleAlert, CircleDollarSign, Coffee, CookingPot, Eye, Flame, GripVertical, HeartPulse, Laptop, ListChecks, Loader2, MapPin, Microwave, Minus, Mountain, Pencil, Percent, Plus, Refrigerator, Rocket, Shirt, Shield, ShieldCheck, Sparkles, Sun, Thermometer, Trees, Tv, Users, Waves, Wind, Wifi, Car } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  saveListingDraft,
  submitNewListing,
  updateListing,
} from "@/lib/actions/listing.actions";
import { listingFormSchema } from "@/lib/validations/listing.schema";
import { ListingBottomNav } from "@/components/host/listing-bottom-nav";
import { listingStopHref } from "@/lib/host/listing-workspace";
import { zodFieldErrors } from "@/lib/utils/zod-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils/format";
import { splitDescriptionPreviewTiers } from "@/lib/utils/description-preview";
import { toast } from "sonner";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import {
  ListingImagesField,
  type ListingMediaUploadState,
} from "@/components/host/listing-images-field";
import {
  ListingLocationMapField,
  type ListingLocationValue,
} from "@/components/host/listing-location-field";
import { ListingAddressField } from "@/components/host/listing-address-field";
import { ListingStreetViewField } from "@/components/host/listing-street-view-field";
import { SuggestMissingOption } from "@/components/host/suggest-missing-option";
import type { HostListingFormData } from "@/lib/serializers/host-listing-form";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import { PropertyTypeIcon } from "@/components/shared/property-type-icon";
import { cn } from "@/lib/utils";
import {
  LISTING_STEP,
  LISTING_STEPS,
  listingStepId,
  normalizeListingStep,
  resumeListingStep,
} from "@/lib/constants/listing-steps";

interface ListingFormProps {
  amenities: { id: string; name: string; category: string; icon?: string | null }[];
  propertyTypes: PropertyTypeOption[];
  initialMediaItems?: ListingMediaItem[];
  /** Serialized from the server (no Prisma Decimal). */
  listing?: HostListingFormData;
  /** Resuming an autosaved in-progress draft of a listing that was never submitted. */
  draftId?: string;
  initialDraft?: ListingDraftData;
  editStatusLabel?: string;
  editStatusApproved?: boolean;
  availabilityHref?: string;
  moderationNote?: string | null;
  initialPane?: "edit" | "preview";
}

type ListingFormValues = {
  title: string;
  description: string;
  propertyType: string;
  address: string;
  city: string;
  area: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  locationSource: string;
  locationConfirmed: string;
  geocodingProvider: string;
  geocodingPlaceId: string;
  geocodingConfidence: string;
  streetViewHeading: string;
  streetViewPitch: string;
  streetViewPanoId: string;
  maxGuests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  baseNightlyRate: string;
  cleaningFee: string;
  minNights: string;
  promotionType: string;
  promotionPercent: string;
  promotionMinimumNights: string;
};

const FALLBACK_TITLE = "Your listing title";
const FALLBACK_DESCRIPTION =
  "Describe the space, the neighborhood, and the details guests should know before booking.";

const STEPS = LISTING_STEPS;
const LOCATION_STEPS: number[] = [
  LISTING_STEP.location,
  LISTING_STEP.address,
  LISTING_STEP.streetView,
];

/** Text fields a reverse-geocode result fills in — see setField/updateLocation for how
 *  these are protected once the host edits one directly. */
const LOCATION_TEXT_FIELDS = ["address", "city", "area", "postalCode", "country"] as const;

const EDIT_SECTIONS = [
  { id: "basics", label: "Basics" },
  { id: "description", label: "Description" },
  { id: "location", label: "Location" },
  { id: "photos", label: "Photos" },
  { id: "details", label: "Property details" },
  { id: "pricing", label: "Pricing" },
  { id: "amenities", label: "Amenities" },
] as const;

type SaveStatus = "saving" | "saved" | "error";

function listingEditSignature(
  values: ListingFormValues,
  mediaItems: ListingMediaItem[],
  amenityIds: string[]
) {
  return JSON.stringify({
    values,
    mediaItems: mediaItems.map(({ id, url, mediaType, alt }) => ({
      id: id ?? null,
      url,
      mediaType,
      alt: alt ?? null,
    })),
    amenityIds: [...amenityIds].sort(),
  });
}

function toPositiveNumber(value: string, fallback: number) {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveInitialMediaItems(
  initialMediaItems: ListingMediaItem[],
  initialDraft?: ListingDraftData
): ListingMediaItem[] {
  if (initialMediaItems.length > 0) return initialMediaItems;

  const draftMediaItems = Array.isArray(initialDraft?.mediaItems)
    ? initialDraft.mediaItems
    : [];
  if (draftMediaItems.length > 0) {
    return draftMediaItems
      .filter((item) => typeof item?.url === "string" && item.url.length > 0)
      .map((item) => ({
        ...item,
        // Drafts saved before mixed-media support did not include mediaType.
        mediaType: item.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
      }));
  }

  return (initialDraft?.imageUrls ?? []).map((url) => ({
    url,
    mediaType: "IMAGE",
  }));
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
      postalCode: listing.property.postalCode ?? "",
      country: listing.property.country,
      latitude:
        listing.property.latitude != null
          ? String(listing.property.latitude)
          : "",
      longitude:
        listing.property.longitude != null
          ? String(listing.property.longitude)
          : "",
      locationSource:
        listing.property.locationSource ??
        (listing.property.latitude != null &&
        listing.property.longitude != null
          ? "LEGACY"
          : ""),
      locationConfirmed:
        listing.property.latitude != null &&
        listing.property.longitude != null
          ? "true"
          : "false",
      geocodingProvider: listing.property.geocodingProvider ?? "",
      geocodingPlaceId: listing.property.geocodingPlaceId ?? "",
      geocodingConfidence:
        listing.property.geocodingConfidence != null
          ? String(listing.property.geocodingConfidence)
          : "",
      streetViewHeading:
        listing.property.streetViewHeading != null
          ? String(listing.property.streetViewHeading)
          : "",
      streetViewPitch:
        listing.property.streetViewPitch != null
          ? String(listing.property.streetViewPitch)
          : "",
      streetViewPanoId: listing.property.streetViewPanoId ?? "",
      maxGuests: String(listing.maxGuests),
      bedrooms: String(listing.bedrooms),
      beds: String(listing.beds),
      bathrooms: String(listing.bathrooms),
      baseNightlyRate: listing.pricingRule ? String(listing.pricingRule.baseNightlyRate) : "",
      cleaningFee: listing.pricingRule ? String(listing.pricingRule.cleaningFee) : "0",
      minNights: listing.pricingRule ? String(listing.pricingRule.minNights) : "1",
      promotionType: "NONE",
      promotionPercent: "15",
      promotionMinimumNights: "5",
    };
  }

  return {
    title: draft?.title ?? "",
    description: draft?.description ?? "",
    propertyType: draft?.propertyType ?? "",
    address: draft?.address ?? "",
    city: draft?.city ?? "",
    area: draft?.area ?? "",
    postalCode: draft?.postalCode ?? "",
    country: draft?.country ?? "",
    latitude: draft?.latitude ?? "",
    longitude: draft?.longitude ?? "",
    locationSource: draft?.locationSource ?? "",
    locationConfirmed: draft?.locationConfirmed ?? "false",
    geocodingProvider: draft?.geocodingProvider ?? "",
    geocodingPlaceId: draft?.geocodingPlaceId ?? "",
    geocodingConfidence: draft?.geocodingConfidence ?? "",
    streetViewHeading: draft?.streetViewHeading ?? "",
    streetViewPitch: draft?.streetViewPitch ?? "",
    streetViewPanoId: draft?.streetViewPanoId ?? "",
    maxGuests: draft?.maxGuests || "2",
    bedrooms: draft?.bedrooms || "1",
    beds: draft?.beds || "1",
    bathrooms: draft?.bathrooms || "1",
    baseNightlyRate: draft?.baseNightlyRate ?? "",
    cleaningFee: draft?.cleaningFee || "0",
    minNights: draft?.minNights || "1",
    promotionType: draft?.promotionType || "NONE",
    promotionPercent: draft?.promotionPercent || "15",
    promotionMinimumNights: draft?.promotionMinimumNights || "5",
  };
}

/** Subset of listingFormSchema's rules worth showing inline, as-you-go, rather than
 * only after a full submit attempt. */
const FIELD_VALIDATORS: Partial<Record<keyof ListingFormValues, (value: string) => string | null>> = {
  title: (v) =>
    v.trim().length < 5
      ? "Title must be at least 5 characters"
      : v.trim().length > 100
        ? "Title must be 100 characters or fewer"
        : null,
  description: (v) =>
    v.trim().length < 20
      ? "Description must be at least 20 characters"
      : v.trim().length > 5000
        ? "Description must be 5,000 characters or fewer"
        : null,
  propertyType: (v) => (v ? null : "Property type is required"),
  address: (v) => (v.trim().length < 3 ? "Address is required" : null),
  city: (v) => (v.trim().length < 2 ? "City is required" : null),
  country: (v) => (v.trim().length < 2 ? "Country is required" : null),
  maxGuests: (v) =>
    !Number.isInteger(Number(v)) || Number(v) < 1 || Number(v) > 20
      ? "Guests must be between 1 and 20"
      : null,
  bedrooms: (v) =>
    !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 20
      ? "Bedrooms must be between 0 and 20"
      : null,
  beds: (v) =>
    !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 40
      ? "Beds must be between 0 and 40"
      : null,
  bathrooms: (v) =>
    !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 20
      ? "Bathrooms must be between 0 and 20"
      : null,
  baseNightlyRate: (v) =>
    !v || !Number.isFinite(Number(v)) || Number(v) < 1
      ? "Nightly rate must be at least €1"
      : null,
  cleaningFee: (v) =>
    v === "" || !Number.isFinite(Number(v)) || Number(v) < 0
      ? "Cleaning fee cannot be negative"
      : null,
  minNights: (v) =>
    !Number.isInteger(Number(v)) || Number(v) < 1
      ? "Minimum stay must be at least 1 night"
      : null,
};

type ListingStepIssue = {
  field: string;
  message: string;
  /** "publish" issues are listed and block Publish, but let the host move on to the
   *  next step. Photos are the case this exists for: the step sits second now, so
   *  hard-blocking Continue until three files finish uploading turns the first real
   *  ask into a wall for anyone still deciding whether to list at all. */
  blocking?: "step" | "publish";
};

/** Which step a publish-blocking field lives on, so the checklist can jump straight
 *  there. Pricing is the fallback because that's where the remaining validated fields
 *  (rate, cleaning fee, minimum stay) are. */
function stepForField(field: string) {
  if (field === "propertyType") return LISTING_STEP.propertyType;
  if (["latitude", "longitude", "locationSource"].includes(field)) {
    return LISTING_STEP.location;
  }
  if (
    ["address", "city", "country", "postalCode", "locationConfirmed"].includes(field)
  ) {
    return LISTING_STEP.address;
  }
  if (["maxGuests", "bedrooms", "beds", "bathrooms"].includes(field)) {
    return LISTING_STEP.details;
  }
  if (field === "media" || field === "mediaUpload") return LISTING_STEP.photos;
  if (field === "title" || field === "description") return LISTING_STEP.description;
  return LISTING_STEP.pricing;
}

function listingStepIssues(
  step: number,
  values: ListingFormValues,
  photoCount: number,
  uploadActive: boolean
): ListingStepIssue[] {
  const fieldsByStep: Partial<Record<number, (keyof ListingFormValues)[]>> = {
    [LISTING_STEP.propertyType]: ["propertyType"],
    [LISTING_STEP.address]: ["address", "city", "country"],
    [LISTING_STEP.details]: ["maxGuests", "bedrooms", "beds", "bathrooms"],
    [LISTING_STEP.description]: ["title", "description"],
    [LISTING_STEP.pricing]: ["baseNightlyRate", "cleaningFee", "minNights"],
  };

  const issues: ListingStepIssue[] = (fieldsByStep[step] ?? []).flatMap((field) => {
    const message = FIELD_VALIDATORS[field]?.(values[field]);
    return message ? [{ field, message }] : [];
  });

  const hasPin = Boolean(values.latitude) && Boolean(values.longitude);

  if (step === LISTING_STEP.location && !hasPin) {
    issues.unshift({
      field: "locationConfirmed",
      message: "Place the pin on the map to continue",
    });
  }

  // No locationConfirmed check here — leaving this step with a valid address is what
  // sets that flag (see confirmAddressIfValid), so requiring it to leave would be a
  // gate that can never open. The address fields above are the real requirement.
  // Street View is deliberately absent too: it's optional and simply unavailable at
  // plenty of addresses.
  if (step === LISTING_STEP.address && !hasPin) {
    issues.unshift({
      field: "locationConfirmed",
      message: "Go back and place the pin on the map",
    });
  }

  if (step === LISTING_STEP.photos) {
    if (uploadActive) {
      // Still a hard stop: leaving mid-upload loses the files.
      issues.push({
        field: "mediaUpload",
        message: "Wait for all photo and video uploads to finish",
      });
    } else if (photoCount < 3) {
      const remaining = 3 - photoCount;
      issues.push({
        field: "media",
        message: `Add ${remaining} more ${remaining === 1 ? "photo" : "photos"} before publishing`,
        blocking: "publish",
      });
    }
  }

  return issues;
}

function FieldSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-b border-border/70 pb-6 last:border-b-0 last:pb-0">
      {title && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function ListingForm({
  amenities,
  propertyTypes,
  listing,
  initialMediaItems = [],
  draftId: initialDraftId,
  initialDraft,
  editStatusLabel,
  editStatusApproved = false,
  availabilityHref,
  moderationNote,
  initialPane,
}: ListingFormProps) {
  const isEditing = !!listing;
  const { resolve } = useI18n();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const paneDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  /** Address-text fields the host has typed into directly, this session — a geocode
   *  result (from moving the pin, pasting a link, etc.) skips these instead of
   *  overwriting a correction the host made on purpose. Starts empty even when editing
   *  an existing listing: pre-existing data isn't "manually edited by the user in this
   *  session", so an initial pin move can still refresh it. See updateLocation.
   *  State (not a ref) so the "won't auto-update" note below each field can actually
   *  render — a host who types a one-off correction has no way to tell it's now
   *  protected otherwise, which is exactly what made a stale test value ("kink's
   *  house") sit unexplained in Address after moving the pin to a real location. */
  const [manuallyEditedLocationFields, setManuallyEditedLocationFields] = useState<
    Set<string>
  >(new Set());
  const [activeEditSection, setActiveEditSection] = useState("basics");
  const editSectionNavRef = useRef<HTMLElement>(null);
  const [activePreviewSection, setActivePreviewSection] = useState("basics");
  const [values, setValues] = useState<ListingFormValues>(() =>
    listingInitialValues(listing, initialDraft)
  );
  const [mediaItems, setMediaItems] = useState<ListingMediaItem[]>(() =>
    resolveInitialMediaItems(initialMediaItems, initialDraft)
  );
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>(
    () => listing?.amenities.map((a) => a.amenityId) ?? initialDraft?.amenityIds ?? []
  );
  const [lastPublishedSignature, setLastPublishedSignature] = useState(() =>
    listingEditSignature(
      listingInitialValues(listing, initialDraft),
      resolveInitialMediaItems(initialMediaItems, initialDraft),
      listing?.amenities.map((a) => a.amenityId) ?? initialDraft?.amenityIds ?? []
    )
  );
  const draftIdRef = useRef<string | null>(initialDraftId ?? null);
  const saveRequestRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const initialStep = isEditing
    ? 0
    : resumeListingStep(initialDraft?.currentStepId, initialDraft?.currentStep);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const currentStepRef = useRef(initialStep);
  // Tapping Preview in the bottom bar from a calendar screen has to land on the
  // preview pane, not the editor, so the bar behaves the same on all five screens.
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">(
    initialPane === "preview" ? "preview" : "edit",
  );
  const [editorWidthPercent, setEditorWidthPercent] = useState(48);
  const [stepsOpen, setStepsOpen] = useState(false);
  /** The map step's reverse geocode is in flight; the Address step renders the
   *  "filling in…" state so its fields don't just sit empty. */
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [publishChecklistOpen, setPublishChecklistOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submittedListingId, setSubmittedListingId] = useState<string | null>(null);
  const [mediaUploadState, setMediaUploadState] = useState<ListingMediaUploadState>({
    active: false,
    progress: 0,
    message: "",
  });
  const [isSubmittingNew, startSubmitNewTransition] = useTransition();
  const currentEditSignature = useMemo(
    () => listingEditSignature(values, mediaItems, selectedAmenityIds),
    [values, mediaItems, selectedAmenityIds]
  );
  const hasUnpublishedChanges =
    isEditing && currentEditSignature !== lastPublishedSignature;

  function confirmManagementNavigation(
    event: ReactMouseEvent<HTMLAnchorElement>
  ) {
    if (
      hasUnpublishedChanges &&
      !window.confirm(
        "You have unpublished listing changes. Leave this page without publishing them?"
      )
    ) {
      event.preventDefault();
    }
  }
  const photoCount = mediaItems.filter(
    (item) => item.mediaType !== "VIDEO"
  ).length;
  const issuesByStep = STEPS.map((_, step) =>
    listingStepIssues(step, values, photoCount, mediaUploadState.active)
  );
  const currentStepIssues = issuesByStep[currentStep] ?? [];
  const currentStepReady = !currentStepIssues.some(
    (issue) => issue.blocking !== "publish"
  );
  const listingReady = issuesByStep.every((issues) => issues.length === 0);

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      if (mediaUploadState.active) {
        return { error: "Wait for your photos and videos to finish uploading." };
      }
      const submittedSignature = currentEditSignature;
      const result = await updateListing(listing!.id, formData);
      if (result && "success" in result && result.success) {
        setLastPublishedSignature(submittedSignature);
        toast.success("Changes published");
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
  const autosaveDraft = useCallback((stepOverride?: number): Promise<boolean> => {
    if (isEditing || !formRef.current) return Promise.resolve(true);
    const request = ++saveRequestRef.current;
    setSaveStatus("saving");
    const fd = new FormData(formRef.current);
    const step = normalizeListingStep(stepOverride ?? currentStepRef.current);
    // Both: the id is what resume reads, the index keeps older readers (the mobile
    // API, the "stopped at step N" line on My listings) working unchanged.
    fd.set("currentStep", String(step));
    fd.set("currentStepId", listingStepId(step));

    const save = saveQueueRef.current.then(async () => {
      try {
        const result = await saveListingDraft(draftIdRef.current, fd);
        if (result && "draftId" in result) {
          draftIdRef.current = result.draftId;
          // Once the first autosave creates the draft, keep its ID in the URL so
          // refreshes and accidental navigation back to this form reopen the same
          // draft. The plain /new route remains reserved for an intentional new draft.
          if (!initialDraftId && window.location.pathname.endsWith("/new")) {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set("draft", result.draftId);
            window.history.replaceState(window.history.state, "", nextUrl);
          }
          if (request === saveRequestRef.current) setSaveStatus("saved");
          return true;
        }
      } catch {
        // The latest queued save owns the visible failure state below.
      }

      if (request === saveRequestRef.current) setSaveStatus("error");
      return false;
    });

    // Draft writes are intentionally serialized. An upload completion can queue a
    // Photos save at almost the same moment the host advances; allowing those writes
    // to race could persist the older Photos step after the newer Description step.
    saveQueueRef.current = save.then(
      () => undefined,
      () => undefined
    );
    return save;
  }, [initialDraftId, isEditing]);

  // Keep the preview instant while batching text edits into a quiet background save.
  // Discrete controls also call autosaveDraft immediately below.
  useEffect(() => {
    if (isEditing) return;
    const timeout = window.setTimeout(() => void autosaveDraft(), 900);
    return () => window.clearTimeout(timeout);
  }, [values, selectedAmenityIds, mediaItems, isEditing, autosaveDraft]);

  useEffect(() => {
    const storedWidth = Number(
      window.localStorage.getItem(
        isEditing ? "bookeasy:listing-edit-width" : "bookeasy:listing-create-width"
      )
    );
    const timeout = window.setTimeout(() => {
      if (Number.isFinite(storedWidth) && storedWidth >= 36 && storedWidth <= 64) {
        setEditorWidthPercent(storedWidth);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isEditing]);

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
    if (!isEditing) setSaveStatus("saving");
    if ((LOCATION_TEXT_FIELDS as readonly string[]).includes(field)) {
      setManuallyEditedLocationFields((current) =>
        current.has(field) ? current : new Set(current).add(field)
      );
    }
    setValues((current) => {
      const next = { ...current, [field]: value };
      // Typing over any part of the address un-confirms it: the host has to look at
      // the edited version and confirm that, not ride on a confirmation they gave for
      // different text.
      if ((LOCATION_TEXT_FIELDS as readonly string[]).includes(field)) {
        next.locationConfirmed = "false";
      }
      return next;
    });
  }

  function updateLocation(patch: Partial<ListingLocationValue>) {
    if (!isEditing) setSaveStatus("saving");
    const replacingFromSearch = patch.locationSource === "AUTOCOMPLETE";
    if (replacingFromSearch) {
      // Choosing a new search result is an explicit request to replace the previous
      // location, including address fields the host may have edited earlier.
      setManuallyEditedLocationFields(new Set());
    }
    setValues((current) => {
      // A geocode result (pin move, pasted link, address search) always carries fresh
      // values for these fields, including empty ones for data the new spot doesn't
      // have — skip any the host has typed over by hand instead of clobbering their
      // correction with it.
      const filtered = { ...patch };
      const pinMoved =
        ("latitude" in filtered && filtered.latitude !== current.latitude) ||
        ("longitude" in filtered && filtered.longitude !== current.longitude);
      if (pinMoved) {
        filtered.streetViewHeading = "";
        filtered.streetViewPitch = "";
        filtered.streetViewPanoId = "";
      }
      for (const field of LOCATION_TEXT_FIELDS) {
        if (!replacingFromSearch && manuallyEditedLocationFields.has(field)) {
          delete filtered[field];
        }
      }
      return { ...current, ...filtered };
    });
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of [
        "address",
        "city",
        "country",
        "latitude",
        "longitude",
        "locationConfirmed",
      ]) {
        delete next[key];
      }
      return next;
    });
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

  /** Sets locationConfirmed, which publishing is rejected server-side without. Silent
   *  by design: the Continue button is already disabled while the address is
   *  incomplete, and listingStepIssues shows why, so a toast here would only fire in
   *  cases the host can already see. */
  function confirmAddressIfValid() {
    if (!values.latitude || !values.longitude) return;
    for (const field of ["address", "city", "country"] as const) {
      if (FIELD_VALIDATORS[field]?.(values[field])) return;
    }
    updateLocation({ locationConfirmed: "true" });
  }

  function handleMediaItemsChange(
    next: ListingMediaItem[] | ((current: ListingMediaItem[]) => ListingMediaItem[])
  ) {
    if (!isEditing) setSaveStatus("saving");
    setMediaItems(next);
    setFieldErrors((current) => {
      if (!("media" in current)) return current;
      const rest = { ...current };
      delete rest.media;
      return rest;
    });
    // Runs after the state update above has been queued — media changes come from
    // discrete user actions (upload/remove/reorder), not continuous typing, so saving
    // immediately (rather than waiting for some unrelated field's blur) is appropriate.
    setTimeout(() => void autosaveDraft(), 0);
  }

  const handleMediaUploadStateChange = useCallback(
    (next: ListingMediaUploadState) => {
      setMediaUploadState((current) =>
        current.active === next.active &&
        current.progress === next.progress &&
        current.message === next.message
          ? current
          : next
      );
    },
    []
  );

  function toggleAmenity(amenityId: string, checked: boolean) {
    if (!isEditing) setSaveStatus("saving");
    setSelectedAmenityIds((current) =>
      checked ? [...current, amenityId] : current.filter((id) => id !== amenityId)
    );
    setTimeout(() => void autosaveDraft(), 0);
  }

  const typeLabel = propertyTypes.find((type) => type.value === values.propertyType)?.label;
  const guests = toPositiveNumber(values.maxGuests, 2);
  const bedrooms = toPositiveNumber(values.bedrooms, 1);
  const beds = toPositiveNumber(values.beds, 1);
  const bathrooms = toPositiveNumber(values.bathrooms, 1);
  const nightlyRate = toPositiveNumber(values.baseNightlyRate, 0);
  const locationLine = [values.area, values.city || "City", values.country || "Country"]
    .filter(Boolean)
    .join(", ");

  function handleSubmitForReview() {
    if (!formRef.current) return;
    if (mediaUploadState.active) {
      toast.info("Wait for your photos and videos to finish uploading.");
      return;
    }

    const parsed = listingFormSchema.safeParse({
      title: values.title,
      description: values.description,
      propertyType: values.propertyType,
      address: values.address,
      city: values.city,
      area: values.area || undefined,
      postalCode: values.postalCode || undefined,
      country: values.country,
      latitude: values.latitude || undefined,
      longitude: values.longitude || undefined,
      locationSource: values.locationSource || undefined,
      locationConfirmed: values.locationConfirmed,
      geocodingProvider: values.geocodingProvider || undefined,
      geocodingPlaceId: values.geocodingPlaceId || undefined,
      geocodingConfidence: values.geocodingConfidence || undefined,
      streetViewHeading: values.streetViewHeading || undefined,
      streetViewPitch: values.streetViewPitch || undefined,
      streetViewPanoId: values.streetViewPanoId || undefined,
      maxGuests: values.maxGuests,
      bedrooms: values.bedrooms,
      bathrooms: values.bathrooms,
      beds: values.beds,
      baseNightlyRate: values.baseNightlyRate,
      cleaningFee: values.cleaningFee || "0",
      minNights: values.minNights || "1",
    });

    const errors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (photoCount < 3) {
      errors.media = "Add at least 3 photos before publishing";
    }
    setFieldErrors(errors);

    const firstErrorField = Object.keys(errors)[0];
    if (firstErrorField) {
      setPublishChecklistOpen(true);
      return;
    }

    const fd = new FormData(formRef.current);
    startSubmitNewTransition(async () => {
      const result = await submitNewListing(fd, draftIdRef.current);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setSubmittedListingId(result.listingId);
      }
    });
  }

  async function leaveListingStudio() {
    const saved = await autosaveDraft();
    if (saved) {
      router.push("/host/listings");
    } else {
      toast.error(
        "Your latest changes could not be saved. Please retry before closing."
      );
    }
  }

  // The chip row scrolls horizontally on mobile, so the chip marking where you are
  // can sit off-screen. Keep it in view without scrolling the form underneath it.
  useEffect(() => {
    const nav = editSectionNavRef.current;
    const chip = nav?.querySelector<HTMLElement>(
      `[data-section-chip="${activeEditSection}"]`,
    );
    if (!nav || !chip) return;
    const offset =
      chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
  }, [activeEditSection]);

  function scrollToEditSection(sectionId: string) {
    const container = editorScrollRef.current;
    const section = container?.querySelector<HTMLElement>(
      `#edit-section-${sectionId}`,
    );
    if (!container || !section) return;
    const containerTop = container.getBoundingClientRect().top;
    const sectionTop = section.getBoundingClientRect().top;
    container.scrollTo({
      top: container.scrollTop + sectionTop - containerTop - 16,
      behavior: "smooth",
    });
    setActiveEditSection(sectionId);
  }

  function updateActiveEditSection() {
    const container = editorScrollRef.current;
    if (!container) return;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
      setActiveEditSection(EDIT_SECTIONS[EDIT_SECTIONS.length - 1].id);
      return;
    }
    const marker = container.getBoundingClientRect().top + 24;
    let active: (typeof EDIT_SECTIONS)[number]["id"] = EDIT_SECTIONS[0].id;
    for (const section of EDIT_SECTIONS) {
      const element = document.getElementById(`edit-section-${section.id}`);
      if (element && element.getBoundingClientRect().top <= marker) active = section.id;
    }
    setActiveEditSection(active);
  }

  function scrollToPreviewSection(sectionId: string) {
    const container = previewScrollRef.current;
    const section = document.getElementById(`preview-section-${sectionId}`);
    if (!container || !section) return;
    const containerTop = container.getBoundingClientRect().top;
    const sectionTop = section.getBoundingClientRect().top;
    container.scrollTo({
      top: container.scrollTop + sectionTop - containerTop - 16,
      behavior: "smooth",
    });
    setActivePreviewSection(sectionId);
  }

  function updateActivePreviewSection() {
    const container = previewScrollRef.current;
    if (!container) return;

    const marker = container.getBoundingClientRect().top + 24;
    let active: (typeof EDIT_SECTIONS)[number]["id"] = EDIT_SECTIONS[0].id;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const section of EDIT_SECTIONS) {
      const element = document.getElementById(`preview-section-${section.id}`);
      if (!element) continue;
      const distance = Math.abs(element.getBoundingClientRect().top - marker);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        active = section.id;
      }
    }

    setActivePreviewSection(active);
  }

  function selectMobilePane(pane: "edit" | "preview") {
    setMobilePane(pane);
  }

  function goToStep(step: number) {
    const nextStep = normalizeListingStep(step);
    // Leaving the Address step with everything valid *is* the confirmation — the host
    // has looked at the prefilled address and moved on. Doing it here rather than on
    // Continue alone also covers Back and jumps from the step list, so a host can't
    // route around it and hit an unexplained server rejection at publish.
    if (
      currentStepRef.current === LISTING_STEP.address &&
      nextStep !== LISTING_STEP.address
    ) {
      confirmAddressIfValid();
    }
    currentStepRef.current = nextStep;
    setCurrentStep(nextStep);
    void autosaveDraft(nextStep);
    selectMobilePane("edit");
    window.requestAnimationFrame(() => editorScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function setEditorPaneWidth(nextWidth: number) {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const availableWidth = workspace.getBoundingClientRect().width - 12;
    if (availableWidth <= 0) return;
    const minEditor = 400;
    const minPreview = 340;
    const width = Math.min(
      Math.max(minEditor, nextWidth),
      Math.max(minEditor, availableWidth - minPreview)
    );
    const percent = Math.min(64, Math.max(36, (width / availableWidth) * 100));
    setEditorWidthPercent(percent);
    window.localStorage.setItem(
      isEditing ? "bookeasy:listing-edit-width" : "bookeasy:listing-create-width",
      percent.toFixed(2)
    );
  }

  function startPaneResize(event: React.PointerEvent<HTMLDivElement>) {
    const editor = editorScrollRef.current;
    if (!editor) return;
    paneDragRef.current = {
      startX: event.clientX,
      startWidth: editor.getBoundingClientRect().width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizePanes(event: React.PointerEvent<HTMLDivElement>) {
    if (!paneDragRef.current) return;
    setEditorPaneWidth(
      paneDragRef.current.startWidth + event.clientX - paneDragRef.current.startX
    );
  }

  return (
    <form
      ref={formRef}
      action={isEditing ? formAction : undefined}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      {!isEditing && (
        <input type="hidden" name="currentStep" value={currentStep} />
      )}
      {state?.error && !isEditing && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {!isEditing && (
        <div className="z-20 shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void leaveListingStudio()}
            >
              <ChevronLeft />
              <Tx k="host.form.my_listings" source="My listings" />
            </Button>
            <h1 className="hidden text-lg font-semibold sm:block">
              <Tx k="host.form.create_listing" source="Create a listing" />
            </h1>
            <div className="flex items-center gap-3 text-sm">
              <span className={saveStatus === "error" ? "text-destructive" : "text-muted-foreground"} aria-live="polite">
                {saveStatus === "saving"
                  ? resolve("host.form.saving", "Saving…").text
                  : saveStatus === "error"
                    ? resolve("host.form.save_failed", "Save failed").text
                    : resolve("host.form.draft_saved", "Draft saved").text}
              </span>
              {saveStatus === "error" && <Button type="button" variant="link" onClick={() => void autosaveDraft()}>
                  <Tx k="host.form.retry" source="Retry" />
                </Button>}
              <Button
                type="button"
                disabled={isSubmittingNew || !listingReady}
                title={
                  listingReady
                    ? undefined
                    : resolve(
                        "host.form.publish_blocked",
                        "Complete all required listing steps before publishing",
                      ).text
                }
                onClick={handleSubmitForReview}
              >
                {mediaUploadState.active ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <Tx k="host.form.uploading" source="Uploading" />
                  </>
                ) : isSubmittingNew ? (
                  resolve("host.form.publishing", "Publishing…").text
                ) : (
                  resolve("host.form.publish", "Publish").text
                )}
              </Button>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }} />
          </div>
          <button
            type="button"
            onClick={() => setStepsOpen(true)}
            className="mt-2 inline-flex min-h-8 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ListChecks className="h-4 w-4" />
            <span className="notranslate" translate="no">
              {`Step ${currentStep + 1} of ${STEPS.length}: ${STEPS[currentStep].title}`}
            </span>
          </button>
        </div>
      )}

      <div
        ref={workspaceRef}
        className="listing-workspace relative min-h-0 flex-1 overflow-hidden"
        style={{ "--listing-editor-width": `${editorWidthPercent}%` } as CSSProperties}
      >
        <div
          id="listing-editor-pane"
          role="tabpanel"
          aria-labelledby="listing-edit-tab"
          data-pane="editor"
          className={`${mobilePane === "edit" ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
        >
          {isEditing && (
            <header className="z-20 shrink-0 border-b bg-background px-5 pb-2.5 pt-2.5 shadow-sm md:pb-3 md:pt-5 md:px-8">
              {/* On mobile the heading only repeats the Edit tab in the bottom bar,
                  and the management link is a bottom-bar destination, so both are
                  desktop-only. That leaves the section chips as the one thing pinned
                  above the form. */}
              <div className="hidden min-w-0 md:block">
                <h1 className="text-2xl font-bold">
                  <Tx k="host.form.edit_listing" source="Edit Listing" />
                </h1>
                {availabilityHref && (
                  <Button
                    className="mt-3 h-auto min-h-10 max-w-full justify-start whitespace-normal py-2 text-left shadow-sm"
                    asChild
                  >
                    <Link
                      href={availabilityHref}
                      onClick={confirmManagementNavigation}
                    >
                      <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        <Tx
                          k="host.form.manage_link"
                          source="Manage availability, pricing & promotions"
                        />
                      </span>
                    </Link>
                  </Button>
                )}
              </div>
              {/* One scrollable row on mobile: wrapping these seven chips cost three
                  stacked rows of the little vertical space the form has. */}
              <nav
                ref={editSectionNavRef}
                className="-mx-5 flex gap-1 overflow-x-auto px-5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] md:mx-0 md:mt-4 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
                aria-label={resolve("host.form.sections_label", "Listing sections").text}
              >
                {EDIT_SECTIONS.map((section) => (
                  <button key={section.id} type="button" data-section-chip={section.id} aria-current={activeEditSection === section.id ? "location" : undefined} onClick={() => scrollToEditSection(section.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm md:text-xs font-medium transition-colors ${activeEditSection === section.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {section.label}
                  </button>
                ))}
              </nav>
            </header>
          )}
          {!isEditing && (
            <header className="z-20 hidden shrink-0 border-b bg-background px-5 pb-3 pt-5 shadow-sm md:block md:px-8">
              <div className="flex min-h-9 min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 shrink-0"
                  onClick={() => void leaveListingStudio()}
                >
                  <ChevronLeft />
                  <Tx k="host.form.my_listings" source="My listings" />
                </Button>
                <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
                <h1 className="shrink-0 text-base font-semibold">
                  <Tx k="host.form.create_listing" source="Create a listing" />
                </h1>
                <span
                  className={`ml-auto shrink-0 text-sm ${
                    saveStatus === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                  aria-live="polite"
                >
                  {saveStatus === "saving"
                    ? resolve("host.form.saving", "Saving…").text
                    : saveStatus === "error"
                      ? resolve("host.form.save_failed", "Save failed").text
                      : resolve("host.form.draft_saved", "Draft saved").text}
                </span>
                {saveStatus === "error" && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="shrink-0 px-1"
                    onClick={() => void autosaveDraft()}
                  >
                    <Tx k="host.form.retry" source="Retry" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={isSubmittingNew || !listingReady}
                  title={
                    listingReady
                      ? undefined
                      : resolve(
                        "host.form.publish_blocked",
                        "Complete all required listing steps before publishing",
                      ).text
                  }
                  onClick={handleSubmitForReview}
                >
                  {mediaUploadState.active ? (
                    <>
                      <Loader2 className="animate-spin" />
                      <Tx k="host.form.uploading" source="Uploading" />
                    </>
                  ) : isSubmittingNew ? (
                    resolve("host.form.publishing", "Publishing…").text
                  ) : (
                    resolve("host.form.publish", "Publish").text
                  )}
                </Button>
              </div>
              <div className="mt-4 flex min-h-[30px] min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStepsOpen(true)}
                  className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm md:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ListChecks className="h-4 w-4 shrink-0" />
                  <span className="notranslate truncate" translate="no">
                    {`Step ${currentStep + 1} of ${STEPS.length}: ${STEPS[currentStep].title}`}
                  </span>
                </button>
                <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${((currentStep + 1) / STEPS.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </header>
          )}
            <div
              ref={editorScrollRef}
              onScroll={isEditing ? updateActiveEditSection : undefined}
            className="min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-contain px-5 py-4 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] md:px-8"
          >
          {isEditing && state?.error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</div>
          )}
          {isEditing && moderationNote && (
            <div className="rounded-lg bg-destructive/10 p-4 text-destructive"><p className="text-sm font-medium">
                <Tx k="host.form.moderation_feedback" source="Moderation feedback:" />
              </p><p className="mt-1 text-sm">{moderationNote}</p></div>
          )}
          {/* The three location steps render their own heading (the map one is
             full-bleed and needs the copy above it), so suppress the shared one. */}
          <div className={isEditing || !LOCATION_STEPS.includes(currentStep) ? undefined : "hidden"}>
            {!isEditing && <p className="notranslate text-sm md:text-xs font-semibold uppercase tracking-wide text-primary md:hidden" translate="no">{`Step ${currentStep + 1} of ${STEPS.length}`}</p>}
            <h2 className="mt-1 text-2xl font-semibold">
              {isEditing
                ? resolve("host.form.listing_details", "Listing details").text
                : STEPS[currentStep].title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEditing
                ? resolve(
                    "host.form.listing_details_hint",
                    "Build the listing exactly as guests will understand it.",
                  ).text
                : STEPS[currentStep].description}
            </p>
          </div>

          <div id={isEditing ? "edit-section-basics" : undefined} className={isEditing || currentStep === LISTING_STEP.propertyType || currentStep === LISTING_STEP.description ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection
            title={
              !isEditing && currentStep === LISTING_STEP.propertyType
                ? resolve("host.form.choose_property_type", "Choose a property type").text
                : resolve("host.form.guest_basics", "Guest-facing basics").text
            }
          >
            <div className={isEditing || currentStep === LISTING_STEP.description ? "space-y-2" : "hidden"}>
              <Label htmlFor="title">
                <Tx k="host.form.title_label" source="Title" />
              </Label>
              <Input
                id="title"
                name="title"
                value={values.title}
                onChange={(event) => setField("title", event.target.value)}
                onBlur={() => handleBlur("title")}
                required
                placeholder={
                  resolve(
                    "host.form.title_placeholder",
                    "Modern apartment near the center",
                  ).text
                }
              />
              <FieldError message={fieldErrors.title} />
            </div>
            <div id={isEditing ? "edit-section-description" : undefined} className={isEditing || currentStep === LISTING_STEP.description ? "scroll-mt-32 space-y-2" : "hidden"}>
              <Label htmlFor="description">
                <Tx k="host.form.description_label" source="Description" />
              </Label>
              <Textarea
                id="description"
                name="description"
                value={values.description}
                onChange={(event) => setField("description", event.target.value)}
                onBlur={() => handleBlur("description")}
                required
                rows={7}
                placeholder={
                  resolve(
                    "host.form.description_placeholder",
                    "Describe the stay, layout, neighborhood, and what makes it easy to book.",
                  ).text
                }
              />
              <div className="flex items-center justify-between">
                <FieldError message={fieldErrors.description} />
                <span
                  className={
                    values.description.trim().length < 20
                      ? "text-sm md:text-xs text-destructive"
                      : "text-sm md:text-xs text-muted-foreground"
                  }
                >
                  {
                    interpolate(
                      resolve("host.form.description_counter", "{count}/20 min"),
                      { count: values.description.trim().length },
                    ).text
                  }
                </span>
              </div>
            </div>
            <div className={isEditing || currentStep === LISTING_STEP.propertyType ? "space-y-3" : "hidden"}>
              <Label id="property-type-label">
                <Tx k="host.form.property_type_label" source="Property type" />
              </Label>
              <input
                id="propertyType"
                type="hidden"
                name="propertyType"
                value={values.propertyType}
              />
              <div
                role="radiogroup"
                aria-labelledby="property-type-label"
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.propertyType)}
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    handleBlur("propertyType");
                  }
                }}
              >
                {propertyTypes.map((type) => {
                  const selected = values.propertyType === type.value;
                  return (
                    <Tooltip key={type.value}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={cn(
                            "group relative flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border bg-background px-3 py-4 text-center shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
                            selected &&
                              "border-primary bg-primary/6 text-primary shadow-[0_10px_30px_-18px_var(--primary)] ring-1 ring-primary"
                          )}
                          onClick={() => {
                            setField("propertyType", type.value);
                            setFieldErrors((current) => ({
                              ...current,
                              propertyType: "",
                            }));
                            window.setTimeout(() => goToStep(1), 0);
                          }}
                        >
                          <span
                            className={cn(
                              "flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary",
                              selected && "bg-primary/12 text-primary"
                            )}
                          >
                            <PropertyTypeIcon
                              name={type.icon}
                              className="size-7"
                            />
                          </span>
                          <span className="text-sm font-semibold leading-tight text-foreground">
                            {type.label}
                          </span>
                          {selected && (
                            <span
                              className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary ring-4 ring-primary/15"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        sideOffset={8}
                        className={cn(
                          "max-w-64 text-center",
                          !type.description && "hidden"
                        )}
                      >
                        {type.description}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <FieldError message={fieldErrors.propertyType} />
              <SuggestMissingOption
                kind="PROPERTY_TYPE"
                listingId={listing?.id}
                label={
                  resolve(
                    "host.form.suggest_property_type",
                    "Don't see your property type? Suggest it",
                  ).text
                }
                placeholder={
                  resolve("host.form.suggest_type_placeholder", "e.g. Houseboat").text
                }
              />
            </div>
          </FieldSection>
          </div>

          {/* Location is three wizard steps — pin, then address, then Street View —
             but a single stacked section when editing an existing listing, where
             everything is on one page anyway. */}
          <div id={isEditing ? "edit-section-location" : undefined} className={isEditing || currentStep === LISTING_STEP.location ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection title={isEditing ? "Location" : undefined}>
            <ListingLocationMapField
              value={values}
              onChange={updateLocation}
              onResolvingChange={setGeocodingAddress}
              active={isEditing || currentStep === LISTING_STEP.location}
              heading={!isEditing}
            />
            <FieldError
              message={
                fieldErrors.locationConfirmed ||
                fieldErrors.latitude ||
                fieldErrors.longitude
              }
            />
          </FieldSection>
          </div>

          <div className={isEditing || currentStep === LISTING_STEP.address ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection title={isEditing ? "Address" : undefined}>
            <ListingAddressField
              value={values}
              onChange={(field, nextValue) => setField(field, nextValue)}
              resolving={geocodingAddress}
              errors={{
                address: fieldErrors.address,
                city: fieldErrors.city,
                country: fieldErrors.country,
              }}
              heading={!isEditing}
            />
          </FieldSection>
          </div>

          <div className={isEditing || currentStep === LISTING_STEP.streetView ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection title={isEditing ? "Street View" : undefined}>
            <ListingStreetViewField
              value={values}
              onChange={updateLocation}
              heading={!isEditing}
            />
          </FieldSection>
          </div>

          <div id={isEditing ? "edit-section-photos" : undefined} className={isEditing || currentStep === LISTING_STEP.photos ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection
            title={resolve("host.form.photos_section", "Photos and videos").text}
          >
            <ListingImagesField
              items={mediaItems}
              onItemsChange={handleMediaItemsChange}
              onUploadStateChange={handleMediaUploadStateChange}
            />
            {/* Translate rewrites these text nodes in place, so React's updates land on
                nodes that are no longer displayed and the count freezes at its first value. */}
            <p className="notranslate text-sm text-muted-foreground" translate="no">
              {`${photoCount} of 3 required photos added`}
            </p>
            <FieldError message={fieldErrors.media} />
          </FieldSection>
          </div>

          <div id={isEditing ? "edit-section-details" : undefined} className={isEditing || currentStep === LISTING_STEP.details ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection title={resolve("host.form.capacity_section", "Capacity").text}>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
              <CapacityCounter
                id="maxGuests"
                label={
                  resolve(
                    "host.form.capacity.guests",
                    "Guests",
                  ).text
                }
                description={
                  resolve(
                    "host.form.capacity.guests_hint",
                    "Maximum overnight guests",
                  ).text
                }
                icon={Users}
                value={values.maxGuests}
                min={1}
                onChange={(value) => setField("maxGuests", value)}
                onBlur={() => void autosaveDraft()}
              />
              <CapacityCounter
                id="bedrooms"
                label={
                  resolve(
                    "host.form.capacity.bedrooms",
                    "Bedrooms",
                  ).text
                }
                description={
                  resolve(
                    "host.form.capacity.bedrooms_hint",
                    "Private sleeping rooms",
                  ).text
                }
                icon={BedDouble}
                value={values.bedrooms}
                min={0}
                onChange={(value) => setField("bedrooms", value)}
                onBlur={() => void autosaveDraft()}
              />
              <CapacityCounter
                id="beds"
                label={
                  resolve(
                    "host.form.capacity.beds",
                    "Beds",
                  ).text
                }
                description={
                  resolve(
                    "host.form.capacity.beds_hint",
                    "Total sleeping spaces",
                  ).text
                }
                icon={Bed}
                value={values.beds}
                min={0}
                onChange={(value) => setField("beds", value)}
                onBlur={() => void autosaveDraft()}
              />
              <CapacityCounter
                id="bathrooms"
                label={
                  resolve(
                    "host.form.capacity.bathrooms",
                    "Bathrooms",
                  ).text
                }
                description={
                  resolve(
                    "host.form.capacity.bathrooms_hint",
                    "Full and half bathrooms",
                  ).text
                }
                icon={Bath}
                value={values.bathrooms}
                min={0}
                onChange={(value) => setField("bathrooms", value)}
                onBlur={() => void autosaveDraft()}
              />
            </div>
          </FieldSection>
          </div>

          <div id={isEditing ? "edit-section-pricing" : undefined} className={isEditing || currentStep === LISTING_STEP.pricing ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection title={resolve("host.workspace.pricing", "Pricing").text}>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
              <PricingField
                id="baseNightlyRate"
                label={
                  resolve(
                    "host.form.pricing.nightly",
                    "Nightly rate",
                  ).text
                }
                description={
                  resolve(
                    "host.form.pricing.nightly_hint",
                    "Your base price per night, before fees",
                  ).text
                }
                icon={CircleDollarSign}
                value={values.baseNightlyRate}
                min={1}
                step="0.01"
                suffix="EUR / night"
                onChange={(value) => setField("baseNightlyRate", value)}
                onBlur={() => handleBlur("baseNightlyRate")}
              />
                <FieldError message={fieldErrors.baseNightlyRate} />
              <PricingField
                id="cleaningFee"
                label={
                  resolve(
                    "host.form.pricing.cleaning",
                    "Cleaning fee",
                  ).text
                }
                description={
                  resolve(
                    "host.form.pricing.cleaning_hint",
                    "One-time fee added to each reservation",
                  ).text
                }
                icon={Sparkles}
                value={values.cleaningFee}
                min={0}
                step="0.01"
                suffix="EUR / stay"
                onChange={(value) => setField("cleaningFee", value)}
                onBlur={() => void autosaveDraft()}
              />
              <CapacityCounter
                id="minNights"
                label={
                  resolve(
                    "host.form.pricing.min_nights",
                    "Minimum nights",
                  ).text
                }
                description={
                  resolve(
                    "host.form.pricing.min_nights_hint",
                    "Shortest stay guests can book",
                  ).text
                }
                icon={CalendarDays}
                value={values.minNights}
                min={1}
                onChange={(value) => setField("minNights", value)}
                onBlur={() => void autosaveDraft()}
              />
            </div>
          </FieldSection>
          </div>

          {!isEditing && (
            <div className={currentStep === LISTING_STEP.specialOffer ? "block" : "hidden"}>
              <FieldSection
                title={
                  resolve("host.form.offer_section", "Launch with a special offer").text
                }
              >
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      <Tx
                        k="host.form.offer_hint"
                        source="This is optional. Choose one ready-made offer or publish without a promotion."
                      />
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {[
                        {
                          title: "Recommended",
                          description: "15% off stays of 5+ nights",
                          percent: "15",
                          nights: "5",
                        },
                        {
                          title: "Long stay",
                          description: "20% off stays of 10+ nights",
                          percent: "20",
                          nights: "10",
                        },
                        {
                          title: "Monthly stay",
                          description: "30% off stays of 30+ nights",
                          percent: "30",
                          nights: "30",
                        },
                      ].map((offer) => {
                        const selected =
                          values.promotionType === "PERCENT_DISCOUNT" &&
                          values.promotionPercent === offer.percent &&
                          values.promotionMinimumNights === offer.nights;
                        return (
                          <button
                            key={offer.nights}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setField("promotionType", "PERCENT_DISCOUNT");
                              setField("promotionPercent", offer.percent);
                              setField("promotionMinimumNights", offer.nights);
                              setTimeout(() => void autosaveDraft(), 0);
                            }}
                            className={cn(
                              "rounded-xl border p-4 text-left transition-colors",
                              selected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "hover:border-primary/40"
                            )}
                          >
                            <CalendarRange className="mb-3 size-5" aria-hidden="true" />
                            <span className="block font-semibold">{offer.title}</span>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {offer.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={values.promotionType === "NONE"}
                      onClick={() => {
                        setField("promotionType", "NONE");
                        setTimeout(() => void autosaveDraft(), 0);
                      }}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        values.promotionType === "NONE"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/40"
                      )}
                    >
                      <Shield className="mb-3 size-5" aria-hidden="true" />
                      <span className="block font-semibold">
                        <Tx k="host.promotion.none_title" source="No promotion" />
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        <Tx
                          k="host.form.offer_none_hint"
                          source="Publish now and add an offer later."
                        />
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={Number(values.cleaningFee) <= 0}
                      aria-pressed={values.promotionType === "FREE_CLEANING"}
                      onClick={() => {
                        setField("promotionType", "FREE_CLEANING");
                        setField(
                          "promotionMinimumNights",
                          String(Math.max(1, Number(values.minNights) || 1))
                        );
                        setTimeout(() => void autosaveDraft(), 0);
                      }}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        values.promotionType === "FREE_CLEANING"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/40",
                        Number(values.cleaningFee) <= 0 &&
                          "cursor-not-allowed opacity-50"
                      )}
                    >
                      <Sparkles className="mb-3 size-5" aria-hidden="true" />
                      <span className="block font-semibold">
                        <Tx k="host.promotion.cleaning_title" source="Free cleaning" />
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {Number(values.cleaningFee) > 0
                          ? "Guests save the full cleaning fee."
                          : "Add a cleaning fee in the previous step first."}
                      </span>
                    </button>
                  </div>

                  {values.promotionType === "PERCENT_DISCOUNT" && (
                    <div className="rounded-xl border p-4">
                      <Label className="text-sm font-semibold">
                        <Tx
                          k="host.promotion.discount_label"
                          source="Discount percentage"
                        />
                      </Label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {["10", "15", "20", "30"].map((percent) => (
                          <Button
                            key={percent}
                            type="button"
                            variant={
                              values.promotionPercent === percent
                                ? "default"
                                : "outline"
                            }
                            onClick={() => {
                              setField("promotionPercent", percent);
                              setTimeout(() => void autosaveDraft(), 0);
                            }}
                          >
                            {percent}%
                          </Button>
                        ))}
                      </div>
                      <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="promotionPercent">
                            <Tx
                              k="host.form.custom_percentage"
                              source="Custom percentage"
                            />
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="promotionPercent"
                              name="promotionPercent"
                              type="number"
                              min={5}
                              max={50}
                              value={values.promotionPercent}
                              onChange={(event) =>
                                setField("promotionPercent", event.target.value)
                              }
                              onBlur={() => void autosaveDraft()}
                            />
                            <Percent className="size-4 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="promotionMinimumNights">
                            <Tx
                              k="host.calendar.minimum_nights"
                              source="Minimum nights"
                            />
                          </Label>
                          <Input
                            id="promotionMinimumNights"
                            name="promotionMinimumNights"
                            type="number"
                            min={1}
                            max={365}
                            value={values.promotionMinimumNights}
                            onChange={(event) =>
                              setField(
                                "promotionMinimumNights",
                                event.target.value
                              )
                            }
                            onBlur={() => void autosaveDraft()}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <input
                    type="hidden"
                    name="promotionType"
                    value={values.promotionType}
                  />
                  {values.promotionType !== "PERCENT_DISCOUNT" && (
                    <>
                      <input
                        type="hidden"
                        name="promotionPercent"
                        value={values.promotionPercent}
                      />
                      <input
                        type="hidden"
                        name="promotionMinimumNights"
                        value={values.promotionMinimumNights}
                      />
                    </>
                  )}

                  {/* Last screen before Publish — the natural place to say that the
                     tools hosts ask for next aren't missing, they're just gated on
                     having a live listing to attach them to. */}
                  <div className="rounded-xl border bg-muted/35 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Rocket className="size-4 shrink-0 text-primary" />
                      <Tx k="host.form.after_publish" source="After you publish" />
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      <Tx
                        k="host.form.after_publish_body"
                        source="Once this listing is live you can block dates on the calendar, set prices for specific dates or seasons, and add more promotions at any time. You'll find all of it under the listing in My listings."
                      />
                    </p>
                  </div>
                </div>
              </FieldSection>
            </div>
          )}

          <div id={isEditing ? "edit-section-amenities" : undefined} className={isEditing || currentStep === LISTING_STEP.amenities ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection>
            <div className="space-y-7">
              {Object.entries(groupedAmenities).map(([category, items]) => (
                <div key={category}>
                  <p className="mb-3 text-sm font-semibold text-foreground">{category}</p>
                  {/* Sized off the container, not the viewport: the editor is a
                      resizable pane, so viewport breakpoints put one card per row
                      even when there is room for three. */}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
                    {items.map((amenity) => {
                      const checked = selectedAmenityIds.includes(amenity.id);
                      const Icon = AMENITY_ICON_MAP[amenity.icon ?? ""] ?? Sparkles;
                      return (
                        <button
                          type="button"
                          key={amenity.id}
                          aria-pressed={checked}
                          onClick={() => toggleAmenity(amenity.id, !checked)}
                          className={cn(
                            "group flex min-h-[64px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                            checked
                              ? "border-primary bg-primary/[0.08] text-foreground shadow-sm ring-1 ring-primary/20"
                              : "border-border/70 bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                          )}
                        >
                          <span className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                            checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                          )}>
                            <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                          </span>
                          <span className="flex-1 text-[0.8125rem] font-medium leading-snug">{amenity.name}</span>
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", checked ? "bg-primary" : "bg-border")} aria-hidden="true" />
                          {checked && <input type="hidden" name="amenityIds" value={amenity.id} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <SuggestMissingOption
                kind="AMENITY"
                listingId={listing?.id}
                label={
                  resolve(
                    "host.form.suggest_amenity",
                    "Don't see an amenity? Suggest it",
                  ).text
                }
                placeholder={
                  resolve("host.form.suggest_amenity_placeholder", "e.g. Rooftop terrace").text
                }
              />
            </div>
          </FieldSection>
          </div>
          {/* Reaching the end of the form is the natural moment to move on to the
              calendar, so say so instead of leaving the host to find the bar. */}
          {isEditing && listing?.id && (
            <div className="flex justify-end pt-6">
              <Button variant="outline" asChild>
                <Link
                  href={listingStopHref(listing.id, "availability")}
                  onClick={confirmManagementNavigation}
                >
                  <Tx k="host.form.next_availability" source="Next: Availability" />
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
          </div>
          {isEditing && (
            <footer className="z-20 hidden shrink-0 border-t bg-background px-5 py-4 shadow-[0_-2px_8px_rgb(0_0_0/0.04)] md:block md:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {availabilityHref && (
                <Button variant="outline" size="lg" asChild>
                  <Link
                    href={availabilityHref}
                    onClick={confirmManagementNavigation}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    <Tx
                      k="host.form.manage_link"
                      source="Manage availability, pricing & promotions"
                    />
                  </Link>
                </Button>
              )}
              {mediaUploadState.active ? (
                <MediaUploadStatus
                  state={mediaUploadState}
                  className="ml-auto max-w-sm"
                />
              ) : hasUnpublishedChanges ? (
                <Button
                  type="submit"
                  size="lg"
                  disabled={isPending}
                  className="w-full sm:w-auto"
                >
                  {isPending
                    ? resolve("host.form.publishing_changes", "Publishing changes…").text
                    : resolve("host.form.publish_changes", "Publish changes").text}
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="block w-full cursor-not-allowed sm:w-fit"
                    >
                      <Button
                        type="button"
                        size="lg"
                        disabled
                        className="w-full sm:w-auto"
                      >
                        <Tx k="host.form.publish_changes" source="Publish changes" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <Tx k="host.form.no_changes" source="No changes have been made." />
                  </TooltipContent>
                </Tooltip>
              )}
              </div>
            </footer>
          )}
          {!isEditing && (
            <footer className="z-20 shrink-0 border-t bg-background px-5 py-4 shadow-[0_-2px_8px_rgb(0_0_0/0.04)] md:px-8">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentStep === LISTING_STEP.propertyType}
                  onClick={() => goToStep(currentStep - 1)}
                >
                  <ChevronLeft /> <Tx k="host.form.back" source="Back" />
                </Button>
                <StepRequirementStatus
                  issues={currentStepIssues}
                  uploadState={
                    currentStep === LISTING_STEP.photos && mediaUploadState.active
                      ? mediaUploadState
                      : undefined
                  }
                />
                {currentStep < STEPS.length - 1 ? (
                  <Button
                    type="button"
                    // Hold Continue while the geocoder is still running, so the host
                    // can't land on the Address step before it has been filled in.
                    disabled={
                      !currentStepReady ||
                      (currentStep === LISTING_STEP.location && geocodingAddress)
                    }
                    aria-describedby={
                      currentStepReady ? undefined : "listing-step-requirements"
                    }
                    onClick={() => goToStep(currentStep + 1)}
                  >
                    <Tx k="host.listings.continue" source="Continue" /> <ChevronRight />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={isSubmittingNew || !listingReady}
                    aria-describedby={
                      listingReady ? undefined : "listing-step-requirements"
                    }
                    onClick={handleSubmitForReview}
                  >
                    {isSubmittingNew ? "Publishing…" : "Publish"}
                  </Button>
                )}
              </div>
            </footer>
          )}
        </div>

        <div
          role="separator"
          aria-label={
                  resolve(
                    "host.form.resize_label",
                    "Resize listing editor and preview",
                  ).text
                }
          aria-orientation="vertical"
          aria-valuemin={36}
          aria-valuemax={64}
          aria-valuenow={Math.round(editorWidthPercent)}
          tabIndex={0}
          onPointerDown={startPaneResize}
          onPointerMove={resizePanes}
          onPointerUp={(event) => {
            paneDragRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            paneDragRef.current = null;
          }}
          onDoubleClick={() => {
            const workspace = workspaceRef.current;
            if (workspace) setEditorPaneWidth((workspace.getBoundingClientRect().width - 12) * 0.48);
          }}
          onKeyDown={(event) => {
            const editor = editorScrollRef.current;
            if (!editor) return;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setEditorPaneWidth(editor.getBoundingClientRect().width - 24);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setEditorPaneWidth(editor.getBoundingClientRect().width + 24);
            } else if (event.key === "Home") {
              event.preventDefault();
              const workspace = workspaceRef.current;
              if (workspace) setEditorPaneWidth((workspace.getBoundingClientRect().width - 12) * 0.48);
            }
          }}
          className="group hidden h-full touch-none cursor-col-resize items-center justify-center bg-border/40 outline-none md:flex"
        >
          <span className="h-full w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-primary" />
          <span className="absolute flex h-10 w-4 items-center justify-center rounded-full border bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </div>

        <aside
          id="listing-preview-pane"
          role="tabpanel"
          aria-labelledby="listing-preview-tab"
          data-pane="preview"
          className={`${mobilePane === "preview" ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
        >
          <header className="z-20 shrink-0 border-b bg-background px-5 pb-3 pt-5 shadow-sm md:px-6">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Tx k="host.form.preview_heading" source="Guest booking preview" />
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                {editStatusLabel && (
                  <Badge
                    variant={editStatusApproved ? "default" : "secondary"}
                  >
                    {editStatusLabel}
                  </Badge>
                )}
                <Badge variant="secondary" className="rounded-md">
                  <Tx k="host.form.preview_live" source="Live" />
                </Badge>
              </div>
            </div>
            <nav className="mt-4 hidden flex-wrap gap-1 md:flex" aria-label={
                  resolve(
                    "host.form.preview_sections_label",
                    "Preview sections",
                  ).text
                }>
              {EDIT_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  aria-current={activePreviewSection === section.id ? "location" : undefined}
                  onClick={() => scrollToPreviewSection(section.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm md:text-xs font-medium transition-colors ${
                    activePreviewSection === section.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </header>
          <div
            ref={previewScrollRef}
            onScroll={updateActivePreviewSection}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable] md:px-6"
          >
            <ListingGuestPreview
              title={values.title || FALLBACK_TITLE}
              description={values.description || FALLBACK_DESCRIPTION}
              typeLabel={typeLabel}
              locationLine={locationLine}
              mediaItems={mediaItems}
              guests={guests}
              bedrooms={bedrooms}
              beds={beds}
              bathrooms={bathrooms}
              nightlyRate={nightlyRate}
              amenities={selectedAmenities}
            />
          </div>
          <footer className="hidden shrink-0 items-center gap-2 border-t bg-background px-5 py-3 text-sm md:text-xs text-muted-foreground shadow-[0_-2px_8px_rgb(0_0_0/0.04)] md:flex md:px-6">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <Tx k="host.form.preview_updates" source="Preview updates as you edit" />
          </footer>
        </aside>
      </div>

      <ListingBottomNav
        listingId={listing?.id ?? ""}
        paneOnly={!isEditing || !listing?.id}
        omitPreview={isEditing}
        /* The action row below owns the safe-area inset now. */
        className={isEditing ? "pb-0" : undefined}
        active={mobilePane === "preview" ? "preview" : "edit"}
        onSelectPane={selectMobilePane}
        onNavigate={confirmManagementNavigation}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const pane = mobilePane === "edit" ? "preview" : "edit";
          selectMobilePane(pane);
          document.getElementById(`listing-${pane}-tab`)?.focus();
        }}
      />

      {/* The two commits sit last, under the navigation: Preview swaps the pane and
          Publish saves, and both are actions on the listing rather than places to
          go. Publish stays visible but disabled with nothing to save, so the pair
          keeps a stable shape instead of the row appearing and shifting the nav. */}
      {isEditing && (
        <div className="z-30 shrink-0 border-t bg-background px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:hidden">
          {mediaUploadState.active ? (
            <MediaUploadStatus state={mediaUploadState} />
          ) : (
            <div className="flex items-stretch gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                aria-controls={
                  mobilePane === "preview"
                    ? "listing-editor-pane"
                    : "listing-preview-pane"
                }
                onClick={() =>
                  selectMobilePane(mobilePane === "preview" ? "edit" : "preview")
                }
              >
                {mobilePane === "preview" ? (
                  <>
                    <Pencil className="h-4 w-4" />
                    <Tx k="host.form.back_to_editor" source="Back to editor" />
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    <Tx k="host.workspace.preview" source="Preview" />
                  </>
                )}
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={isPending || !hasUnpublishedChanges}
                className="flex-1"
              >
                {isPending ? "Publishing…" : "Publish"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!isEditing && (
        <Dialog open={stepsOpen} onOpenChange={setStepsOpen}>
          <DialogContent variant="sheet" className="md:max-w-md">
            <DialogHeader>
              <DialogTitle>
                <Tx k="host.form.steps_title" source="Listing steps" />
              </DialogTitle>
              <DialogDescription>
                <Tx
                  k="host.form.steps_hint"
                  source="Jump to any part of your listing. Your draft is saved automatically."
                />
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {STEPS.map((step, index) => {
                const blockingStep =
                  index > currentStep
                    ? issuesByStep.findIndex(
                        (issues, stepIndex) =>
                          stepIndex < index &&
                          // Publish-only issues (too few photos) list themselves but
                          // must not lock every later step behind them.
                          issues.some((issue) => issue.blocking !== "publish")
                      )
                    : -1;
                const disabled = blockingStep >= 0;

                return (
                  <button
                    key={step.title}
                    type="button"
                    disabled={disabled}
                    aria-current={currentStep === index ? "step" : undefined}
                    onClick={() => {
                      goToStep(index);
                      setStepsOpen(false);
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      currentStep === index
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted disabled:hover:bg-transparent"
                    }`}
                  >
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm md:text-xs font-semibold ${currentStep === index ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{step.title}</span>
                      <span className="block truncate text-sm md:text-xs text-muted-foreground">
                        {disabled
                          ? `Complete ${STEPS[blockingStep].title} first`
                          : step.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={publishChecklistOpen} onOpenChange={setPublishChecklistOpen}>
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>
              <Tx
                k="host.form.checklist_title"
                source="Finish your listing before publishing"
              />
            </DialogTitle>
            <DialogDescription>
              <Tx
                k="host.form.checklist_hint"
                source="Select an item to go directly to that step."
              />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {Object.entries(fieldErrors).map(([field, message]) => (
              <button
                key={field}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted"
                onClick={() => {
                  goToStep(stepForField(field));
                  setPublishChecklistOpen(false);
                }}
              >
                <span>{message}</span><ChevronRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!submittedListingId}
        onOpenChange={(open) => {
          if (!open && submittedListingId) {
            router.push("/host/listings");
          }
        }}
      >
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>
              <Tx
                k="host.form.published_title"
                source="Listing published successfully"
              />
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              <Tx
                k="host.form.published_body"
                source="Your listing is live. You can return to My Listings or continue editing it now. Our team will still review the content shortly, so keep it accurate. Questions? Contact"
              />{" "}
              <a
                href="mailto:hello@lingerhomes.com"
                className="notranslate underline underline-offset-2"
                translate="no"
              >
                hello@lingerhomes.com
              </a>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/host/listings")}
            >
              <Tx k="host.form.go_to_listings" source="Go to My Listings" />
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (submittedListingId) {
                  router.push(`/host/listings/${submittedListingId}/edit`);
                }
              }}
            >
              <Tx k="host.form.continue_editing" source="Continue editing" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}

const AMENITY_ICON_MAP: Record<string, LucideIcon> = {
  wifi: Wifi,
  wind: Wind,
  thermometer: Thermometer,
  shirt: Shirt,
  tv: Tv,
  "cooking-pot": CookingPot,
  refrigerator: Refrigerator,
  microwave: Microwave,
  coffee: Coffee,
  sun: Sun,
  trees: Trees,
  car: Car,
  waves: Waves,
  bath: Bath,
  flame: Flame,
  shield: Shield,
  "heart-pulse": HeartPulse,
  "mountain-snow": Mountain,
  building: Building,
  laptop: Laptop,
};

function StepRequirementStatus({
  issues,
  uploadState,
}: {
  issues: ListingStepIssue[];
  uploadState?: ListingMediaUploadState;
}) {
  if (issues.length === 0 && !uploadState) return <span className="ml-auto" />;

  return (
    <div
      id="listing-step-requirements"
      className="ml-auto flex min-w-0 max-w-xl flex-1 flex-col items-end gap-1.5"
      role="status"
      aria-live="polite"
    >
      {uploadState && (
        <MediaUploadStatus
          state={uploadState}
          className="w-full max-w-sm flex-none"
        />
      )}
      {issues.length > 0 && (
        <p className="flex items-start gap-1.5 text-right text-sm md:text-xs leading-relaxed text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{issues.map((issue) => issue.message).join(" · ")}</span>
        </p>
      )}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm md:text-xs text-destructive">{message}</p>;
}

function MediaUploadStatus({
  state,
  className,
}: {
  state: ListingMediaUploadState;
  className?: string;
}) {
  const { resolve } = useI18n();
  return (
    <div
      className={cn("flex min-w-0 flex-1 items-center gap-3", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-sm md:text-xs">
          <span className="truncate font-medium">{state.message}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {state.progress}%
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={
                  resolve(
                    "host.form.upload_progress_label",
                    "Media upload progress",
                  ).text
                }
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.progress}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function PricingField({
  id,
  label,
  description,
  icon: Icon,
  value,
  min,
  step,
  suffix,
  onChange,
  onBlur,
}: {
  id: keyof ListingFormValues;
  label: string;
  description: string;
  icon: typeof Users;
  value: string;
  min: number;
  step?: string;
  suffix: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div className="flex min-h-[88px] items-center gap-4 border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-base font-semibold">{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex w-44 shrink-0 items-center gap-2">
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
          className="text-right font-semibold tabular-nums"
        />
        <span className="w-20 shrink-0 text-sm md:text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function CapacityCounter({
  id,
  label,
  description,
  icon: Icon,
  value,
  min,
  onChange,
  onBlur,
}: {
  id: keyof ListingFormValues;
  label: string;
  description: string;
  icon: typeof Users;
  value: string;
  min: number;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const numericValue = Number(value);
  const canDecrease = Number.isFinite(numericValue) && numericValue > min;

  const updateValue = (nextValue: number) => {
    onChange(String(Math.max(min, nextValue)));
    onBlur?.();
  };

  return (
    <div className="flex min-h-[88px] items-center gap-4 border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <Label htmlFor={id} className="text-base font-semibold">{label}</Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/80 bg-background p-1 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          aria-label={`Decrease ${label}`}
          disabled={!canDecrease}
          onClick={() => updateValue((Number.isFinite(numericValue) ? numericValue : min) - 1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          id={id}
          name={id}
          type="number"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          required
          aria-label={label}
          className="h-9 w-12 border-0 bg-transparent p-0 text-center text-base font-semibold tabular-nums shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          aria-label={`Increase ${label}`}
          onClick={() => updateValue((Number.isFinite(numericValue) ? numericValue : min) + 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DescriptionPreviewSplit({ description }: { description: string }) {
  const {
    landing,
    property,
    expanded,
    landingTruncated,
    expandedTruncated,
  } = splitDescriptionPreviewTiers(description);

  if (!landingTruncated) {
    return (
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    );
  }

  return (
    <div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {landing}…
      </p>
      <div className="my-4 flex items-center gap-3">
        <span className="h-0 flex-1 border-t border-dashed border-muted-foreground/40" />
        <span className="whitespace-nowrap text-sm md:text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          <Tx
            k="host.form.preview_landing_end"
            source="Landing page preview ends here"
          />
        </span>
        <span className="h-0 flex-1 border-t border-dashed border-muted-foreground/40" />
      </div>
      {property && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {property}{expandedTruncated ? "…" : ""}
        </p>
      )}
      {expandedTruncated && (
        <>
          <div className="my-4 flex items-center gap-3">
            <span className="h-0 flex-1 border-t border-dashed border-muted-foreground/40" />
            <span className="whitespace-nowrap text-sm md:text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              <Tx
                k="host.form.preview_show_more"
                source={'Visible only after "Show more"'}
              />
            </span>
            <span className="h-0 flex-1 border-t border-dashed border-muted-foreground/40" />
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground/50">
            {expanded}
          </p>
        </>
      )}
    </div>
  );
}

function ListingGuestPreview({
  title,
  description,
  typeLabel,
  locationLine,
  mediaItems,
  guests,
  bedrooms,
  beds,
  bathrooms,
  nightlyRate,
  amenities,
}: {
  title: string;
  description: string;
  typeLabel?: string;
  locationLine: string;
  mediaItems: ListingMediaItem[];
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  nightlyRate: number;
  amenities: { id: string; name: string; category: string; icon?: string | null }[];
}) {
  const { resolve } = useI18n();
  const displayedMedia = mediaItems.slice(0, 5);

  return (
    <div className="listing-guest-preview bg-background">
      <div id="preview-section-basics" className="scroll-mt-4 p-4 md:p-6">
        <div className="mb-5">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold leading-tight tracking-tight md:text-[26px]">
              {title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span
                id="preview-section-location"
                className="flex min-w-0 scroll-mt-4 items-center gap-1 text-muted-foreground"
              >
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
        </div>

        <div id="preview-section-photos" className="scroll-mt-4">
          <PreviewGallery mediaItems={displayedMedia} />
        </div>

        <div className="listing-guest-preview-layout mt-10 grid grid-cols-1 gap-10">
          <div className="space-y-8">
            <div
              id="preview-section-details"
              className="flex scroll-mt-4 flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/80 pb-2 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {
                  interpolate(resolve("host.preview.guests", "{count} guests"), {
                    count: guests,
                  }).text
                }
              </span>
              <span className="flex items-center gap-1.5">
                <BedDouble className="h-4 w-4" />
                {
                  interpolate(resolve("host.preview.bedrooms", "{count} bedrooms"), {
                    count: bedrooms,
                  }).text
                }
              </span>
              <span className="flex items-center gap-1.5">
                <Bed className="h-4 w-4" />
                {
                  interpolate(resolve("host.preview.beds", "{count} beds"), {
                    count: beds,
                  }).text
                }
              </span>
              <span className="flex items-center gap-1.5">
                <Bath className="h-4 w-4" />
                {
                  interpolate(resolve("host.preview.baths", "{count} baths"), {
                    count: bathrooms,
                  }).text
                }
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div
                className="notranslate flex size-14 items-center justify-center rounded-full border-2 border-border bg-muted text-lg font-semibold"
                translate="no"
              >
                BE
              </div>
              <div>
                <p className="font-semibold">
                  <Tx k="host.preview.hosted_by" source="Hosted by Linger Homes" />
                </p>
                <p className="text-sm text-muted-foreground">
                  <Tx
                    k="host.preview.host_blurb"
                    source="Fast replies and local support."
                  />
                </p>
              </div>
            </div>

            <Separator />

            <div id="preview-section-description" className="scroll-mt-4">
              <h4 className="mb-4 text-xl font-semibold">
                <Tx k="host.preview.about" source="About this space" />
              </h4>
              <DescriptionPreviewSplit description={description} />
            </div>

            <Separator />
            <div id="preview-section-amenities" className="scroll-mt-4">
              <h4 className="mb-4 text-xl font-semibold">
                <Tx k="host.preview.amenities" source="What this place offers" />
              </h4>
              {amenities.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {amenities.slice(0, 8).map((amenity) => (
                      <div key={amenity.id} className="flex items-center gap-2 text-sm">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        {amenity.name}
                      </div>
                    ))}
                  </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Tx
                    k="host.preview.amenities_empty"
                    source="Selected amenities will appear here."
                  />
                </p>
              )}
            </div>
          </div>

          <div
            id="preview-section-pricing"
            className="listing-guest-preview-booking w-full max-w-[360px] scroll-mt-4 justify-self-end overflow-hidden rounded-2xl border-2 border-border shadow-xl"
          >
            <div className="px-6 pb-2 pt-6">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold">
                  {nightlyRate > 0 ? formatPrice(nightlyRate) : "EUR"}
                </span>
                <span className="text-base text-muted-foreground">
                  <Tx k="host.preview.per_night" source="/ night" />
                </span>
              </div>
            </div>

            <div className="space-y-4 px-6 pb-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  <Tx k="host.preview.dates" source="Dates" />
                </p>
                <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-background text-sm md:text-xs">
                  <div className="border-r p-3">
                    <p className="font-semibold uppercase">
                      <Tx k="host.preview.check_in" source="Check-in" />
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      <Tx k="host.preview.select_date" source="Select date" />
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="font-semibold uppercase">
                      <Tx k="host.preview.check_out" source="Check-out" />
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      <Tx k="host.preview.select_date" source="Select date" />
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  <Tx k="host.preview.guests_label" source="Guests" />
                </p>
                <div className="flex items-center justify-between rounded-xl border bg-background px-3.5 py-3 text-sm">
                  <span>
                    <Tx k="host.preview.one_guest" source="1 guest" />
                  </span>
                  <span className="text-muted-foreground">
                    <Tx k="host.workspace.edit" source="Edit" />
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  <Tx k="host.preview.message_host" source="Message to host" />{" "}
                  <span className="font-normal text-muted-foreground">
                    <Tx k="host.preview.optional" source="(optional)" />
                  </span>
                </p>
                <div className="min-h-20 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  <Tx
                    k="host.preview.message_placeholder"
                    source="Introduce yourself and share any useful details."
                  />
                </div>
              </div>

              <Button
                type="button"
                className="w-full rounded-lg py-6 text-base font-semibold"
                disabled
              >
                <Tx k="host.preview.reserve" source="Reserve" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewGallery({ mediaItems }: { mediaItems: ListingMediaItem[] }) {
  if (mediaItems.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground ring-1 ring-black/5">
        <Tx
          k="host.preview.gallery_empty"
          source="Photos and videos will appear here"
        />
      </div>
    );
  }

  const [cover, ...gridImages] = mediaItems;

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-black/5">
      <div className="grid max-h-[360px] grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted md:col-span-2 md:row-span-2 md:aspect-auto">
          <PreviewMedia item={cover} />
        </div>
        {gridImages.map((item, index) => (
          <div key={`${item.mediaType}-${item.url}-${index}`} className="relative hidden aspect-[4/3] overflow-hidden bg-muted md:block">
            <PreviewMedia item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewMedia({ item }: { item: ListingMediaItem }) {
  if (item.mediaType === "VIDEO") {
    return (
      <video
        src={item.url}
        className="h-full w-full object-cover"
        controls
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" className="h-full w-full object-cover" />
  );
}
