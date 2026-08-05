"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bath, Bed, BedDouble, Building, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, CircleAlert, CircleDollarSign, Coffee, CookingPot, Eye, Flame, GripVertical, HeartPulse, Laptop, ListChecks, Loader2, MapPin, Microwave, Minus, Mountain, Pencil, Plus, Refrigerator, Shirt, Shield, ShieldCheck, Sparkles, Sun, Thermometer, Trees, Tv, Users, Waves, Wind, Wifi, Car } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  saveListingDraft,
  submitNewListing,
  updateListing,
} from "@/lib/actions/listing.actions";
import { listingFormSchema } from "@/lib/validations/listing.schema";
import { ListingBottomNav } from "@/components/host/listing-bottom-nav";
import { ListingWizardHeaderActions } from "@/components/host/listing-wizard-header-actions";
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
import { OfferPreview } from "@/components/host/calendar-editor-ui";
import {
  resolveAmenityCategory,
  resolveAmenityLabel,
} from "@/lib/i18n/amenity-labels";
import {
  ListingImagesField,
  type ListingMediaUploadState,
} from "@/components/host/listing-images-field";
import {
  finiteCoordinate,
  ListingLocationMapField,
  type ListingLocationValue,
} from "@/components/host/listing-location-field";
import { ListingAddressField } from "@/components/host/listing-address-field";
import {
  AVAILABILITY_START_ERROR_ID,
  AvailabilityStartScreen,
  DatePricingCta,
  PrePublishMenu,
  PrePublishTaskScreen,
  type PrePublishScreen,
  type PrePublishTask,
  type PrePublishTaskActions,
} from "@/components/host/listing-prepublish-plan";
import {
  parsePrePublishPlan,
  type PrePublishPlan,
  type PrePublishRange,
} from "@/lib/types/listing-prepublish-plan";
import {
  prePublishBackTarget,
  type PrePublishOrigin,
} from "@/lib/types/listing-prepublish-navigation";
import { availabilityBlocksPublish } from "@/lib/types/listing-availability-start";
import { ListingStreetViewField } from "@/components/host/listing-street-view-field";
import {
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  StayTimesFields,
  normalizeStayTime,
} from "@/components/host/listing-stay-times";
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
  checkInTime: string;
  checkOutTime: string;
  promotionType: string;
  promotionPercent: string;
  promotionMinimumNights: string;
  promotionFreeCleaning: string;
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
  { id: "rules", label: "Stay rules" },
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
      // No default pair here, unlike a new draft: a listing published before these
      // existed has no stated times, and inventing 15:00/11:00 for it would tell
      // guests something the host never agreed to.
      checkInTime: normalizeStayTime(listing.checkInTime),
      checkOutTime: normalizeStayTime(listing.checkOutTime),
      promotionType: "NONE",
      promotionPercent: "",
      promotionMinimumNights: "",
      promotionFreeCleaning: "false",
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
    maxGuests: draft?.maxGuests ?? "0",
    bedrooms: draft?.bedrooms ?? "0",
    beds: draft?.beds ?? "0",
    bathrooms: draft?.bathrooms ?? "0",
    baseNightlyRate: draft?.baseNightlyRate ?? "",
    cleaningFee: draft?.cleaningFee || "0",
    minNights: draft?.minNights || "1",
    // `??`, not `||`: "" is the host having picked "Flexible", and re-filling the
    // standard time on every resume would quietly undo that choice.
    checkInTime: normalizeStayTime(draft?.checkInTime ?? DEFAULT_CHECK_IN_TIME),
    checkOutTime: normalizeStayTime(draft?.checkOutTime ?? DEFAULT_CHECK_OUT_TIME),
    promotionType:
      draft?.promotionType === "PERCENT_DISCOUNT" ? "PERCENT_DISCOUNT" : "NONE",
    promotionPercent:
      draft?.promotionType === "PERCENT_DISCOUNT"
        ? draft.promotionPercent || "15"
        : "",
    promotionMinimumNights:
      draft?.promotionType === "PERCENT_DISCOUNT"
        ? draft.promotionMinimumNights || "5"
        : "",
    promotionFreeCleaning: "false",
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
        message: `Add ${remaining} more ${remaining === 1 ? "photo" : "photos"} to continue`,
      });
    }
  }

  return issues;
}

// The five launch-offer choices stack on a phone, so they read as a compact
// list there (icon beside the text) and only become the desktop card at md.
const OFFER_CARD =
  "flex min-h-11 items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors md:block md:min-h-0 md:rounded-xl md:p-4";
const OFFER_ICON = "size-4 shrink-0 md:mb-3 md:size-5";
const OFFER_TITLE = "block text-sm font-semibold md:text-base";
const OFFER_DESC = "block text-[0.7rem] text-muted-foreground md:mt-1 md:text-sm";

function FieldSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3 border-b border-border/70 pb-4 last:border-b-0 last:pb-0 md:space-y-4 md:pb-6", className)}>
      {title && (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** The Location section on the edit page: what is saved, and one CTA into the three
 *  location screens. Editing the pin, the address and Street View in place beside
 *  every other field never gave the map the room it needs, and — unlike the create
 *  wizard — there was no point at which the host confirms the edited address, which
 *  is exactly what publishing is rejected without (see confirmAddressIfValid). */
function LocationSummary({
  values,
  error,
  onEdit,
}: {
  values: ListingFormValues;
  error?: string;
  onEdit: () => void;
}) {
  const latitude = finiteCoordinate(values.latitude, -90, 90);
  const longitude = finiteCoordinate(values.longitude, -180, 180);
  const hasPin = latitude !== null && longitude !== null;
  const addressLine = [
    values.address,
    values.area,
    [values.postalCode, values.city].filter(Boolean).join(" "),
    values.country,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  const hasStreetView = Boolean(
    values.streetViewPanoId || values.streetViewHeading
  );

  return (
    // notranslate for the same reason as the location screens themselves: these rows
    // swap between subtrees as the host edits, and React's next update then lands on
    // nodes Google Translate has already replaced.
    <div className="notranslate space-y-3 rounded-xl border p-3 md:p-4">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">
            {addressLine || "No address saved yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasPin
              ? `Pin at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
              : "No pin placed on the map yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasStreetView ? "Street View saved" : "No Street View chosen"}
          </p>
        </div>
      </div>
      <FieldError message={error} />
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={onEdit}
        >
          <MapPin className="h-4 w-4" />
          Edit location
        </Button>
        <p className="text-xs text-muted-foreground">
          Opens the map, address and Street View screens, one at a time.
        </p>
      </div>
    </div>
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
  const i18n = useI18n();
  const { resolve } = i18n;
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
  /** Editing an existing listing: which of the three location screens the host opened
   *  from the Location section, or null while the section shows its summary and the
   *  rest of the form. The create wizard drives the same screens off currentStep. */
  const [locationStep, setLocationStep] = useState<number | null>(null);
  const locationEditorOpen = isEditing && locationStep !== null;
  /** The edit page's one-long-page sections: the location editor takes over the whole
   *  pane while it is open, so they stand down. */
  const showEditSections = isEditing && !locationEditorOpen;
  /** The location screen on show, whichever flow is driving it. */
  const activeLocationStep = isEditing ? locationStep : currentStep;
  /**
   * The optional date setup that follows the last numbered step: `null` while the host
   * is still in the wizard proper, `"menu"` for the checklist, or the task they opened
   * from it. Finishing a task returns to the checklist rather than publishing — the
   * checklist offers three things, so publishing after the first would make it a lie.
   */
  const [prePublishScreen, setPrePublishScreen] =
    useState<PrePublishScreen | null>(null);
  /** Which entrance the open task screen was reached through, so that closing it goes
   *  back where the host actually was — the checklist, or the Pricing step. */
  const [prePublishOrigin, setPrePublishOrigin] =
    useState<PrePublishOrigin>("menu");
  const [prePublishPlan, setPrePublishPlan] = useState<PrePublishPlan>(() =>
    parsePrePublishPlan(initialDraft?.prePublishPlan)
  );
  /** The host has tried to move on from the availability question without answering it.
   *  Until then the screen stays quiet — arriving to a red error you have had no chance
   *  to satisfy reads as broken rather than as guidance. */
  const [availabilityAttempted, setAvailabilityAttempted] = useState(false);
  /** The dates selected on the open task screen, and a handle to its editor. The
   *  bottom bar is the only commit affordance a phone shows, so on the pricing screen
   *  it becomes "Edit price" the moment a range exists rather than a Done that
   *  abandons the selection the host just made. */
  const [prePublishSelection, setPrePublishSelection] =
    useState<PrePublishRange | null>(null);
  const prePublishActions = useRef<PrePublishTaskActions | null>(null);
  const pricingSelected =
    prePublishScreen === "pricing" && prePublishSelection !== null;
  /** A create-wizard step check. Always false while editing, where sections are shown
   *  by showEditSections rather than by step, and false throughout the pre-publish
   *  screens, which replace the step body rather than sitting under it. */
  const onCreateStep = (...steps: number[]) =>
    !isEditing && prePublishScreen === null && steps.includes(currentStep);
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
  const currentStepReady = currentStepIssues.length === 0;
  const listingReady = issuesByStep.every((issues) => issues.length === 0);
  const hasLaunchOffer = values.promotionType === "PERCENT_DISCOUNT";
  /** The availability answer is required, so it holds Publish alongside the numbered
   *  steps. Never a gate while editing — a published listing's availability is edited
   *  on its calendar, not here. The publish action re-checks this regardless; a
   *  disabled button is a courtesy, not the enforcement. */
  const availabilityUnconfirmed = availabilityBlocksPublish({
    isEditing,
    availabilityStart: prePublishPlan.availabilityStart,
  });
  const canPublishNew = listingReady && !availabilityUnconfirmed;
  const canPublishFromReview = canPublishNew && prePublishScreen === "menu";
  // Hold Continue while the geocoder is still running, so the host can't land on
  // the Address step before it has been filled in.
  const continueReady =
    currentStepReady &&
    !(currentStep === LISTING_STEP.location && geocodingAddress);
  // The location editor gates its Continue on exactly the same requirements as the
  // matching wizard step.
  const locationStepIssues =
    locationStep !== null ? (issuesByStep[locationStep] ?? []) : [];
  const locationContinueReady =
    locationStepIssues.length === 0 &&
    !(locationStep === LISTING_STEP.location && geocodingAddress);
  /** The lookup is what Continue is waiting for, so Continue is where it reports —
   *  a disabled button with an unchanged label just read as broken. */
  const wizardSearchingAddress =
    currentStep === LISTING_STEP.location && geocodingAddress;
  const locationEditorSearchingAddress =
    locationStep === LISTING_STEP.location && geocodingAddress;
  /** What the header calls the current pre-publish screen. Unnumbered on purpose. */
  const prePublishHeading =
    prePublishScreen === "availability-start"
      ? i18n.resolve(
          "host.prepublish.availability_start_title",
          "When can guests book?",
        ).text
      : prePublishScreen === "availability"
      ? i18n.resolve("host.prepublish.availability_title", "Set availability").text
      : prePublishScreen === "pricing"
        ? i18n.resolve("host.prepublish.pricing_title", "Customize pricing").text
        : prePublishScreen === "offers"
          ? i18n.resolve("host.prepublish.offers_title", "Customize promotions")
              .text
          : i18n.resolve(
              "host.prepublish.review_heading",
              "Review before publishing",
            ).text;

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
  const guests = toPositiveNumber(values.maxGuests, 0);
  const bedrooms = toPositiveNumber(values.bedrooms, 0);
  const beds = toPositiveNumber(values.beds, 0);
  const bathrooms = toPositiveNumber(values.bathrooms, 0);
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
      checkInTime: values.checkInTime,
      checkOutTime: values.checkOutTime,
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

    // Reachable even with Publish disabled — the keyboard, a stale render, a draft
    // resumed from before this screen existed. Send the host to the question rather
    // than letting the server reject a submit they can't see the reason for.
    if (availabilityUnconfirmed) {
      setAvailabilityAttempted(true);
      openAvailabilityStart();
      return;
    }
    if (!isEditing && prePublishScreen !== "menu") {
      openPrePublishMenu();
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
    // Jumping to a numbered step from the step list leaves the optional screens.
    setPrePublishScreen(null);
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
    // The nightly rate is the only thing the Pricing step is really asking for, so
    // land the caret in it — two frames because the step's fields are still hidden
    // on the first one, and focusing a hidden input does nothing.
    if (nextStep === LISTING_STEP.pricing && !isEditing) {
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          const input = document.getElementById("baseNightlyRate");
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
          }
        })
      );
    }
  }

  function scrollEditorToTop() {
    window.requestAnimationFrame(() =>
      editorScrollRef.current?.scrollTo({ top: 0 })
    );
  }

  /** Leaving the last numbered step lands on the availability question — the one thing
   *  every host has to answer — and the optional checklist comes after it. */
  function openAvailabilityStart() {
    setPrePublishOrigin("menu");
    setPrePublishScreen("availability-start");
    selectMobilePane("edit");
    scrollEditorToTop();
  }

  /** Past the availability question and on to the optional checklist. Held shut until
   *  the answer is there, so the host cannot arrive at Publish without one. */
  function continueFromAvailabilityStart() {
    if (availabilityUnconfirmed) {
      setAvailabilityAttempted(true);
      return;
    }
    openPrePublishMenu();
  }

  /** The blocking calendar, opened from the availability question. Same screen and same
   *  plan as the checklist's availability task — only the way back differs. */
  function openBlockingCalendar() {
    setPrePublishOrigin("availability-start");
    setPrePublishScreen("availability");
    selectMobilePane("edit");
    scrollEditorToTop();
  }

  function openPrePublishMenu() {
    setPrePublishOrigin("menu");
    setPrePublishScreen("menu");
    selectMobilePane("edit");
    scrollEditorToTop();
  }

  function openPrePublishTask(task: PrePublishTask) {
    setPrePublishOrigin("menu");
    setPrePublishScreen(task);
    scrollEditorToTop();
  }

  /** The Pricing step's own way into date pricing. Same screen, same plan — only the
   *  way back differs, which is what the origin records. */
  function openDatePricingFromPricingStep() {
    setPrePublishOrigin("pricing-step");
    setPrePublishScreen("pricing");
    selectMobilePane("edit");
    scrollEditorToTop();
  }

  /** Back out one screen at a time: a task returns to wherever it was opened from —
   *  the checklist, or the Pricing step — and the checklist returns to the wizard. */
  function backFromPrePublish() {
    setPrePublishScreen(prePublishBackTarget(prePublishScreen, prePublishOrigin));
    scrollEditorToTop();
  }

  function updatePrePublishPlan(next: PrePublishPlan) {
    setPrePublishPlan(next);
    // The hidden field the draft save reads is rendered from state, so the save has
    // to wait for React to commit it — otherwise the draft keeps the previous plan.
    window.requestAnimationFrame(() => void autosaveDraft());
  }

  function openLocationEditor() {
    setLocationStep(LISTING_STEP.location);
    selectMobilePane("edit");
    window.requestAnimationFrame(() =>
      editorScrollRef.current?.scrollTo({ top: 0 })
    );
  }

  function closeLocationEditor() {
    // The host has been through the location screens and come back, so treat a valid
    // address as confirmed — the same rule the wizard applies on leaving that step,
    // and without it "Publish changes" is rejected as soon as the pin has moved.
    confirmAddressIfValid();
    setLocationStep(null);
    // Two frames: the sections are still unmounted on the first one, and
    // scrollToEditSection quietly does nothing when it can't find the section.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => scrollToEditSection("location"))
    );
  }

  /** Moving between the three location screens. Stepping off either end closes the
   *  editor: the first screen's Back goes back to the listing, and the last one's
   *  Done is the same trip forwards. */
  function goToLocationStep(step: number) {
    if (step < LISTING_STEP.location || step > LISTING_STEP.streetView) {
      closeLocationEditor();
      return;
    }
    if (locationStep === LISTING_STEP.address) confirmAddressIfValid();
    setLocationStep(step);
    window.requestAnimationFrame(() =>
      editorScrollRef.current?.scrollTo({ top: 0 })
    );
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
        <>
          <input type="hidden" name="currentStep" value={currentStep} />
          {/* Both the draft autosave and the publish submit read this form, so the
              optional date setup travels with them without a separate save path. */}
          <input
            type="hidden"
            name="prePublishPlan"
            value={JSON.stringify(prePublishPlan)}
          />
        </>
      )}
      {/* The visible selects live on one screen each — the availability question in the
          wizard, the Stay rules section when editing — but publish submits from the
          checklist, by which point those controls are unmounted. Carrying the values
          here keeps them in the FormData from wherever the host happens to save. */}
      <input type="hidden" name="checkInTime" value={values.checkInTime} />
      <input type="hidden" name="checkOutTime" value={values.checkOutTime} />
      {state?.error && !isEditing && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* The wizard's own phone title bar is gone: leave / jump-to-step / save
          state live in the shell header (which already collapses on scroll), and
          all that is left in the page is a 2px progress hairline. */}
      {!isEditing && (
        <>
          <ListingWizardHeaderActions
            step={currentStep}
            totalSteps={STEPS.length}
            showCounter={prePublishScreen === null}
            stepTitle={
              prePublishScreen === null
                ? STEPS[currentStep].title
                : prePublishHeading
            }
            saveStatus={saveStatus}
            onOpenSteps={() => setStepsOpen(true)}
            onLeave={() => void leaveListingStudio()}
            onRetrySave={() => void autosaveDraft()}
          />
          <div className={cn("h-0.5 shrink-0 bg-muted md:hidden", prePublishScreen !== null && "hidden")} aria-hidden="true">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${((currentStep + 1) / STEPS.length) * 100}%`,
              }}
            />
          </div>
        </>
      )}

      <div
        ref={workspaceRef}
        className="listing-workspace relative min-h-0 flex-1 overflow-hidden"
        style={{ "--listing-editor-width": `${editorWidthPercent}%` } as CSSProperties}
      >
        <div
          id="listing-editor-pane"
          // Not a tabpanel any more: neither screen renders a tablist, so the
          // pane is a labelled region the action row's Preview button controls.
          role="group"
          aria-label={resolve("host.workspace.edit", "Edit").text}
          data-pane="editor"
          className={`${mobilePane === "edit" ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
        >
          {locationEditorOpen && (
            <header className="z-20 shrink-0 border-b bg-background px-5 pb-2.5 pt-2.5 shadow-sm md:px-8 md:pb-3 md:pt-5">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 shrink-0"
                  onClick={closeLocationEditor}
                >
                  <ChevronLeft />
                  <Tx k="host.form.back_to_listing" source="Back to listing" />
                </Button>
                <span
                  className="mx-1 h-5 w-px shrink-0 bg-border"
                  aria-hidden="true"
                />
                <h1 className="min-w-0 truncate text-base font-semibold">
                  {STEPS[locationStep!].title}
                </h1>
              </div>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <span
                  className="notranslate shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  translate="no"
                >
                  {`Step ${locationStep! - LISTING_STEP.location + 1} of ${LOCATION_STEPS.length}`}
                </span>
                <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${((locationStep! - LISTING_STEP.location + 1) / LOCATION_STEPS.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </header>
          )}
          {showEditSections && (
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
                  {prePublishScreen === "pricing" ? (
                    <Tx k="host.prepublish.pricing_title" source="Customize pricing" />
                  ) : (
                    <Tx k="host.form.create_listing" source="Create a listing" />
                  )}
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
                  disabled={isSubmittingNew || !canPublishFromReview}
                  title={
                    canPublishFromReview
                      ? undefined
                      : canPublishNew
                        ? resolve(
                            "host.form.publish_after_review",
                            "Review your availability, pricing and promotions before publishing",
                          ).text
                      : availabilityUnconfirmed && listingReady
                        ? resolve(
                            "host.form.publish_blocked_availability",
                            "Confirm when guests can start booking before publishing",
                          ).text
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
              {prePublishScreen === null && <div className="mt-4 flex min-h-[30px] min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStepsOpen(true)}
                  className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm md:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ListChecks className="h-4 w-4 shrink-0" />
                  <span className="notranslate truncate" translate="no">
                    {prePublishScreen === null
                      ? `Step ${currentStep + 1} of ${STEPS.length}: ${STEPS[currentStep].title}`
                      : prePublishHeading}
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
              </div>}
            </header>
          )}
            <div
              ref={editorScrollRef}
              onScroll={isEditing ? updateActiveEditSection : undefined}
              className={cn(
                "min-h-0 flex-1 px-4 py-3 md:px-8 md:py-4",
                activeLocationStep === LISTING_STEP.location
                  ? "flex flex-col overflow-hidden"
                  : "touch-pan-y space-y-3 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] md:space-y-4",
              )}
          >
          {showEditSections && state?.error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</div>
          )}
          {showEditSections && moderationNote && (
            <div className="rounded-lg bg-destructive/10 p-4 text-destructive"><p className="text-sm font-medium">
                <Tx k="host.form.moderation_feedback" source="Moderation feedback:" />
              </p><p className="mt-1 text-sm">{moderationNote}</p></div>
          )}
          {/* The optional date setup after the last step. It replaces the step body
             rather than adding to it, and brings its own headings. */}
          {prePublishScreen !== null && (
            <div className="scroll-mt-32">
              {prePublishScreen === "availability-start" ? (
                <AvailabilityStartScreen
                  plan={prePublishPlan}
                  onChange={updatePrePublishPlan}
                  onOpenBlockingCalendar={openBlockingCalendar}
                  showError={availabilityAttempted}
                  stayTimes={
                    <StayTimesFields
                      checkInTime={values.checkInTime}
                      checkOutTime={values.checkOutTime}
                      onChange={setField}
                    />
                  }
                />
              ) : prePublishScreen === "menu" ? (
                <PrePublishMenu
                  plan={prePublishPlan}
                  onOpenTask={openPrePublishTask}
                  onEditAvailability={openAvailabilityStart}
                  onEditPricing={() => goToStep(LISTING_STEP.pricing)}
                  onEditPromotion={() => goToStep(LISTING_STEP.specialOffer)}
                  baseNightlyRate={values.baseNightlyRate}
                  cleaningFee={values.cleaningFee}
                  minimumNights={values.minNights}
                  promotionType={values.promotionType}
                  promotionPercent={values.promotionPercent}
                  promotionMinimumNights={values.promotionMinimumNights}
                  currency="EUR"
                />
              ) : (
                <PrePublishTaskScreen
                  key={prePublishScreen}
                  task={prePublishScreen}
                  plan={prePublishPlan}
                  onChange={updatePrePublishPlan}
                  currency="EUR"
                  baseNightlyRate={values.baseNightlyRate}
                  hasCleaningFee={toPositiveNumber(values.cleaningFee, 0) > 0}
                  onSelectionChange={setPrePublishSelection}
                  actionRef={prePublishActions}
                />
              )}
            </div>
          )}

          {/* The three location steps render their own heading (the map one is
             full-bleed and needs the copy above it), so suppress the shared one. */}
          <div className={showEditSections || (!isEditing && prePublishScreen === null && !LOCATION_STEPS.includes(currentStep)) ? undefined : "hidden"}>
            {/* The step counter moved to the shell header chip, so repeating it
                here only cost a line of scroll. */}
            <h2 className="text-lg font-semibold md:text-2xl">
              {isEditing
                ? resolve("host.form.listing_details", "Listing details").text
                : STEPS[currentStep].title}
            </h2>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground md:line-clamp-none md:text-sm">
              {isEditing
                ? resolve(
                    "host.form.listing_details_hint",
                    "Build the listing exactly as guests will understand it.",
                  ).text
                : STEPS[currentStep].description}
            </p>
          </div>

          <div id={isEditing ? "edit-section-basics" : undefined} className={showEditSections || onCreateStep(LISTING_STEP.propertyType, LISTING_STEP.description) ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection
            // On the wizard's property-type step the step heading already says
            // "Property type", so a section title here is a third repetition.
            title={
              !isEditing && currentStep === LISTING_STEP.propertyType
                ? undefined
                : resolve("host.form.guest_basics", "Guest-facing basics").text
            }
          >
            <div className={showEditSections || onCreateStep(LISTING_STEP.description) ? "space-y-2" : "hidden"}>
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
            <div id={isEditing ? "edit-section-description" : undefined} className={showEditSections || onCreateStep(LISTING_STEP.description) ? "scroll-mt-32 space-y-2" : "hidden"}>
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
                className="min-h-32 md:min-h-44"
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
            <div className={showEditSections || onCreateStep(LISTING_STEP.propertyType) ? "space-y-3" : "hidden"}>
              <Label
                id="property-type-label"
                className={isEditing ? undefined : "sr-only md:not-sr-only"}
              >
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
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3"
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
                            "group relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-background px-2 py-2.5 text-center shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:min-h-28 md:gap-3 md:rounded-2xl md:px-3 md:py-4",
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
                              "flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary md:size-12 md:rounded-xl",
                              selected && "bg-primary/12 text-primary"
                            )}
                          >
                            <PropertyTypeIcon
                              name={type.icon}
                              className="size-5 md:size-7"
                            />
                          </span>
                          <span className="text-xs font-semibold leading-tight text-foreground md:text-sm">
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

          {/* Location is always three screens — pin, then address, then Street View.
             The create wizard reaches them as steps 4-6; the edit page reaches the
             same three from the summary below, one at a time. Nothing is unmounted
             either way: these fields carry the hidden inputs the form submits. */}
          {showEditSections && (
            <div id="edit-section-location" className="scroll-mt-32 block">
              <FieldSection
                title={resolve("host.form.location_section", "Location").text}
              >
                <LocationSummary
                  values={values}
                  error={
                    fieldErrors.locationConfirmed ||
                    fieldErrors.latitude ||
                    fieldErrors.longitude ||
                    fieldErrors.address ||
                    fieldErrors.city ||
                    fieldErrors.country
                  }
                  onEdit={openLocationEditor}
                />
              </FieldSection>
            </div>
          )}

          <div className={activeLocationStep === LISTING_STEP.location ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <FieldSection className="flex min-h-0 flex-1 flex-col space-y-0 border-0 pb-0 md:space-y-0 md:pb-0">
            <ListingLocationMapField
              value={values}
              onChange={updateLocation}
              onResolvingChange={setGeocodingAddress}
              active={activeLocationStep === LISTING_STEP.location}
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

          <div className={activeLocationStep === LISTING_STEP.address ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection>
            <ListingAddressField
              value={values}
              onChange={(field, nextValue) => setField(field, nextValue)}
              resolving={geocodingAddress}
              active={activeLocationStep === LISTING_STEP.address}
              errors={{
                address: fieldErrors.address,
                city: fieldErrors.city,
                country: fieldErrors.country,
              }}
            />
          </FieldSection>
          </div>

          <div className={activeLocationStep === LISTING_STEP.streetView ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection>
            <ListingStreetViewField value={values} onChange={updateLocation} />
          </FieldSection>
          </div>

          <div id={isEditing ? "edit-section-photos" : undefined} className={showEditSections || onCreateStep(LISTING_STEP.photos) ? "scroll-mt-32 block" : "hidden"}>
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
            <p className="notranslate text-xs text-muted-foreground md:text-sm" translate="no">
              {`${photoCount} of 3 required photos added`}
            </p>
            <FieldError message={fieldErrors.media} />
          </FieldSection>
          </div>

          <div id={isEditing ? "edit-section-details" : undefined} className={showEditSections || onCreateStep(LISTING_STEP.details) ? "scroll-mt-32 block" : "hidden"}>
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

          <div id={isEditing ? "edit-section-pricing" : undefined} className={showEditSections || onCreateStep(LISTING_STEP.pricing) ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection
            // Same repetition as the property-type step: the step heading above already
            // says "Pricing", and dropping the duplicate buys back a row of scroll on
            // the screen where the fields are tallest.
            title={
              !isEditing && currentStep === LISTING_STEP.pricing
                ? undefined
                : resolve("host.workspace.pricing", "Pricing").text
            }
          >
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
              {/* Create wizard only: the plan exists to carry date prices into the
                  listing that publish creates. An existing listing has its own
                  calendar, which is where its date prices are edited. */}
              {!isEditing && (
                <DatePricingCta
                  plan={prePublishPlan}
                  onOpen={openDatePricingFromPricingStep}
                />
              )}
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

          {/* Edit only. In the create wizard the same fields sit under the availability
              question, which every host has to answer — putting them here as well would
              ask the same thing twice in one flow. */}
          {showEditSections && (
            <div id="edit-section-rules" className="scroll-mt-32 block">
              <FieldSection title={resolve("host.form.rules_section", "Stay rules").text}>
                <StayTimesFields checkInTime={values.checkInTime} checkOutTime={values.checkOutTime} onChange={setField} />
              </FieldSection>
            </div>
          )}

          {!isEditing && (
            <div
              className={
                prePublishScreen === null &&
                currentStep === LISTING_STEP.specialOffer
                  ? "block"
                  : "hidden"
              }
            >
              <FieldSection>
                <div className="space-y-3 md:space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground md:text-sm">
                      <Tx
                        k="host.form.offer_hint"
                        source="Optionally offer a discount to attract guests. Choose a ready-made offer or publish without one."
                      />
                    </p>
                    <div className="mt-2 grid gap-2 md:mt-4 md:grid-cols-3 md:gap-3">
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
                              setField(
                                "promotionType",
                                selected ? "NONE" : "PERCENT_DISCOUNT",
                              );
                              setField("promotionPercent", selected ? "" : offer.percent);
                              setField(
                                "promotionMinimumNights",
                                selected ? "" : offer.nights,
                              );
                              setField("promotionFreeCleaning", "false");
                              setTimeout(() => void autosaveDraft(), 0);
                            }}
                            className={cn(
                              OFFER_CARD,
                              selected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "hover:border-primary/40"
                            )}
                          >
                            <CalendarRange className={OFFER_ICON} aria-hidden="true" />
                            <span className="min-w-0 md:block">
                              <span className={OFFER_TITLE}>{offer.title}</span>
                              <span className={OFFER_DESC}>
                                {offer.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3 md:p-4">
                    <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="promotionPercent">
                          <Tx k="host.form.offer_percentage" source="Percentage" />
                        </Label>
                        <div className="relative">
                          <Input
                            id="promotionPercent"
                            name="promotionPercent"
                            type="number"
                            min={5}
                            max={50}
                            value={values.promotionPercent}
                            onChange={(event) => {
                              const next = event.target.value;
                              setField("promotionPercent", next);
                              setField(
                                "promotionType",
                                next || values.promotionMinimumNights
                                  ? "PERCENT_DISCOUNT"
                                  : "NONE",
                              );
                            }}
                            onBlur={() => void autosaveDraft()}
                            className="pr-9"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                            %
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="promotionMinimumNights">
                            <Tx
                              k="host.calendar.minimum_nights"
                              source="Minimum nights"
                            />
                          </Label>
                          {(hasLaunchOffer ||
                            values.promotionPercent ||
                            values.promotionMinimumNights) && (
                            <button
                              type="button"
                              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              onClick={() => {
                                setField("promotionType", "NONE");
                                setField("promotionPercent", "");
                                setField("promotionMinimumNights", "");
                                setField("promotionFreeCleaning", "false");
                                setTimeout(() => void autosaveDraft(), 0);
                              }}
                            >
                              <Tx k="filters.clear" source="Clear" />
                            </button>
                          )}
                        </div>
                        <Input
                          id="promotionMinimumNights"
                          name="promotionMinimumNights"
                          type="number"
                          min={1}
                          max={365}
                          value={values.promotionMinimumNights}
                          onChange={(event) => {
                            const next = event.target.value;
                            setField("promotionMinimumNights", next);
                            setField(
                              "promotionType",
                              next || values.promotionPercent
                                ? "PERCENT_DISCOUNT"
                                : "NONE",
                            );
                          }}
                          onBlur={() => void autosaveDraft()}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      <Tx
                        k="host.form.offer_edit_hint"
                        source="Feel free to edit manually."
                      />
                    </p>
                  </div>

                  <input
                    type="hidden"
                    name="promotionType"
                    value={values.promotionType}
                  />
                  <input
                    type="hidden"
                    name="promotionFreeCleaning"
                    value={values.promotionFreeCleaning}
                  />
                  <OfferPreview
                    headline={
                      values.promotionPercent && values.promotionMinimumNights ? (
                        <>
                          {" "}
                          {
                            interpolate(
                              resolve(
                                "host.promotion.summary_percent",
                                "{percent}% off",
                              ),
                              { percent: values.promotionPercent },
                            ).text
                          }
                          {
                            interpolate(
                              resolve(
                                "host.promotion.summary_minimum",
                                " · {nights}+ nights",
                              ),
                              { nights: values.promotionMinimumNights },
                            ).text
                          }
                        </>
                      ) : (
                        <Tx
                          k="host.form.offer_none_selected"
                          source="No special offer selected"
                        />
                      )
                    }
                  />
                </div>
              </FieldSection>
            </div>
          )}

          <div id={isEditing ? "edit-section-amenities" : undefined} className={showEditSections || onCreateStep(LISTING_STEP.amenities) ? "scroll-mt-32 block" : "hidden"}>
          <FieldSection>
            <div className="space-y-4 md:space-y-7">
              {Object.entries(groupedAmenities).map(([category, items]) => {
                const categoryLabel = resolveAmenityCategory({ resolve }, category);
                return (
                  <div key={category}>
                    <p
                      className={cn(
                        "mb-2 text-xs font-semibold text-foreground md:mb-3 md:text-sm",
                        categoryLabel.translated && "notranslate",
                      )}
                    >
                      {categoryLabel.text}
                    </p>
                    {/* Sized off the container, not the viewport: the editor is a
                      resizable pane, so viewport breakpoints put one card per row
                      even when there is room for three. */}
                    <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 md:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] md:gap-2.5">
                      {items.map((amenity) => {
                      const checked = selectedAmenityIds.includes(amenity.id);
                      const Icon = AMENITY_ICON_MAP[amenity.icon ?? ""] ?? Sparkles;
                      const amenityLabel = resolveAmenityLabel({ resolve }, amenity.name);
                      return (
                        <button
                          type="button"
                          key={amenity.id}
                          aria-pressed={checked}
                          onClick={() => toggleAmenity(amenity.id, !checked)}
                          className={cn(
                            // pr-6 keeps the label clear of the corner check, and the
                            // label itself wraps rather than running off the card:
                            // translated amenity names are routinely twice the length
                            // of the English ones this grid was sized against.
                            "group relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border py-1.5 pl-2 pr-6 text-left transition-all md:min-h-[64px] md:gap-2.5 md:rounded-xl md:py-2.5 md:pl-3 md:pr-7",
                            checked
                              ? "border-primary bg-primary/[0.08] text-foreground shadow-sm ring-1 ring-primary/20"
                              : "border-border/70 bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                          )}
                        >
                          <span className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors md:size-9 md:rounded-lg",
                            checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                          )}>
                            <Icon className="size-4 md:h-[1.125rem] md:w-[1.125rem]" aria-hidden="true" />
                          </span>
                          <span
                            className={cn(
                              "min-w-0 flex-1 hyphens-auto break-words text-xs font-medium leading-snug md:text-[0.8125rem]",
                              amenityLabel.translated && "notranslate",
                            )}
                          >
                            {amenityLabel.text}
                          </span>
                          {/* A tick in the corner instead of a dot on the baseline:
                              the dot sat in the text's row, so a wrapped label pushed
                              it off the card. */}
                          {checked && (
                            <span
                              className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                              aria-hidden="true"
                            >
                              <Check className="size-3" strokeWidth={3} />
                            </span>
                          )}
                          {checked && <input type="hidden" name="amenityIds" value={amenity.id} />}
                        </button>
                      );
                      })}
                    </div>
                  </div>
                );
              })}
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
          {showEditSections && listing?.id && (
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
          {/* The location editor's own desktop footer: the same Back / Continue pair
              the wizard uses, ending in Done rather than Publish — publishing stays
              on the listing page behind it. */}
          {locationEditorOpen && (
            <footer className="z-20 hidden shrink-0 border-t bg-background px-5 py-4 shadow-[0_-2px_8px_rgb(0_0_0/0.04)] md:block md:px-8">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goToLocationStep(locationStep! - 1)}
                >
                  <ChevronLeft /> <Tx k="host.form.back" source="Back" />
                </Button>
                <StepRequirementStatus
                  id="listing-location-requirements"
                  issues={locationStepIssues}
                />
                {locationStep === LISTING_STEP.streetView ? (
                  <Button type="button" onClick={closeLocationEditor}>
                    <Tx k="host.form.location_done" source="Done" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={!locationContinueReady}
                    aria-describedby={
                      locationContinueReady
                        ? undefined
                        : "listing-location-requirements"
                    }
                    onClick={() => goToLocationStep(locationStep! + 1)}
                  >
                    <ContinueLabel searching={locationEditorSearchingAddress} />
                  </Button>
                )}
              </div>
            </footer>
          )}
          {showEditSections && (
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
          {/* Desktop only: on phones the wizard's single action row lives at the
              form root, so that Preview can stay reachable from both panes. */}
          {!isEditing && (
            <footer className="z-20 hidden shrink-0 border-t bg-background px-5 py-4 shadow-[0_-2px_8px_rgb(0_0_0/0.04)] md:block md:px-8">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    prePublishScreen === null &&
                    currentStep === LISTING_STEP.propertyType
                  }
                  onClick={
                    prePublishScreen !== null
                      ? backFromPrePublish
                      : () => goToStep(currentStep - 1)
                  }
                >
                  <ChevronLeft /> <Tx k="host.form.back" source="Back" />
                </Button>
                {prePublishScreen === null && (
                  <StepRequirementStatus
                    issues={currentStepIssues}
                    uploadState={
                      currentStep === LISTING_STEP.photos && mediaUploadState.active
                        ? mediaUploadState
                        : undefined
                    }
                  />
                )}
                {/* The availability question continues forwards to the checklist; a
                    task screen's primary action returns to wherever it was opened
                    from; the checklist itself is where publishing happens. */}
                {prePublishScreen === "availability-start" ? (
                  <Button
                    type="button"
                    // Left enabled so pressing it can say what is missing. A dead
                    // button with no explanation is the worse of the two failures.
                    onClick={continueFromAvailabilityStart}
                    aria-describedby={
                      availabilityUnconfirmed
                        ? AVAILABILITY_START_ERROR_ID
                        : undefined
                    }
                  >
                    <ContinueLabel searching={false} />
                  </Button>
                ) : prePublishScreen !== null && prePublishScreen !== "menu" ? (
                  <div className="flex items-center gap-2">
                    {pricingSelected ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => prePublishActions.current?.clearSelection()}
                      >
                        <Tx k="host.calendar.cancel" source="Cancel" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={
                        pricingSelected
                          ? () => prePublishActions.current?.openEditor()
                          : backFromPrePublish
                      }
                    >
                      <span key={pricingSelected ? "edit-price" : "done"}>
                        {pricingSelected ? (
                          <Tx k="host.prepublish.edit_price" source="Edit price" />
                        ) : (
                          <Tx k="host.prepublish.done" source="Done" />
                        )}
                      </span>
                    </Button>
                  </div>
                ) : prePublishScreen === "menu" ? (
                  <Button
                    type="button"
                    disabled={isSubmittingNew || !canPublishNew}
                    aria-describedby={
                      canPublishNew ? undefined : "listing-step-requirements"
                    }
                    onClick={handleSubmitForReview}
                  >
                    {isSubmittingNew
                      ? resolve("host.form.publishing", "Publishing…").text
                      : i18n.resolve("host.prepublish.publish_now", "Publish now")
                          .text}
                  </Button>
                ) : currentStep < STEPS.length - 1 ? (
                  <Button
                    type="button"
                    // Hold Continue while the geocoder is still running, so the host
                    // can't land on the Address step before it has been filled in.
                    disabled={!continueReady}
                    aria-describedby={
                      currentStepReady ? undefined : "listing-step-requirements"
                    }
                    onClick={() => goToStep(currentStep + 1)}
                  >
                    <ContinueLabel searching={wizardSearchingAddress} />
                  </Button>
                ) : (
                  // The last numbered step no longer publishes: it hands over to the
                  // availability question, and the optional date setup after it.
                  <Button
                    type="button"
                    disabled={!continueReady}
                    aria-describedby={
                      currentStepReady ? undefined : "listing-step-requirements"
                    }
                    onClick={openAvailabilityStart}
                  >
                    <ContinueLabel
                      searching={false}
                      withoutOffer={!hasLaunchOffer}
                    />
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
          role="group"
          aria-label={resolve("host.workspace.preview", "Preview").text}
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

      {/* The wizard's whole phone chrome: one row of Back · Preview · Continue.
          It sits outside the workspace so Preview can switch the pane and still
          offer the way back, and it carries the step's blocking requirement as a
          line above itself — which most of the time isn't there at all. */}
      {!isEditing && (
        <div className="z-30 shrink-0 border-t bg-background px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
          {prePublishScreen === null &&
            (currentStepIssues.length > 0 || mediaUploadState.active) && (
            <div className="mb-1.5 flex justify-end">
              <StepRequirementStatus
                id="listing-step-requirements-mobile"
                issues={currentStepIssues}
                uploadState={
                  currentStep === LISTING_STEP.photos && mediaUploadState.active
                    ? mediaUploadState
                    : undefined
                }
              />
            </div>
          )}
          <div className="flex items-stretch gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-11 shrink-0 px-0"
              aria-label={resolve("host.form.back", "Back").text}
              disabled={
                prePublishScreen === null &&
                currentStep === LISTING_STEP.propertyType
              }
              onClick={
                prePublishScreen !== null
                  ? backFromPrePublish
                  : () => goToStep(currentStep - 1)
              }
            >
              <ChevronLeft />
            </Button>
            {/* Nothing on the pricing screen reaches the guest preview — the custom
                prices are not on a listing yet — so the button there was a trip to
                an unchanged page and back. It keeps its place on every other screen,
                where the preview does move. */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={cn("flex-1", prePublishScreen === "pricing" && "hidden")}
              aria-controls={
                mobilePane === "preview"
                  ? "listing-editor-pane"
                  : "listing-preview-pane"
              }
              onClick={() =>
                selectMobilePane(mobilePane === "preview" ? "edit" : "preview")
              }
            >
              {/* Keyed so React remounts the label instead of mutating its text
                  node. Google Translate swaps text nodes for its own <font>
                  wrappers, and an in-place update then lands on a detached node —
                  which is why the icon changed but the word stayed "Preview". */}
              <span
                key={mobilePane}
                className="inline-flex items-center gap-1.5"
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
              </span>
            </Button>
            {prePublishScreen === "availability-start" ? (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                onClick={continueFromAvailabilityStart}
                aria-describedby={
                  availabilityUnconfirmed ? AVAILABILITY_START_ERROR_ID : undefined
                }
              >
                <ContinueLabel searching={false} />
              </Button>
            ) : prePublishScreen !== null && prePublishScreen !== "menu" ? (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                onClick={
                  pricingSelected
                    ? () => prePublishActions.current?.openEditor()
                    : backFromPrePublish
                }
              >
                {/* Keyed for the same reason the Preview label is: Google Translate
                    replaces the text node, and an in-place swap would land on the
                    detached one and leave the old word on screen. */}
                <span key={pricingSelected ? "edit-price" : "done"}>
                  {pricingSelected ? (
                    <Tx k="host.prepublish.edit_price" source="Edit price" />
                  ) : (
                    <Tx k="host.prepublish.done" source="Done" />
                  )}
                </span>
              </Button>
            ) : prePublishScreen === "menu" ? (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={isSubmittingNew || !canPublishNew}
                aria-describedby={
                  canPublishNew ? undefined : "listing-step-requirements-mobile"
                }
                onClick={handleSubmitForReview}
              >
                {isSubmittingNew
                  ? resolve("host.form.publishing", "Publishing…").text
                  : i18n.resolve("host.prepublish.publish_now", "Publish now").text}
              </Button>
            ) : currentStep < STEPS.length - 1 ? (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={!continueReady}
                aria-describedby={
                  currentStepReady
                    ? undefined
                    : "listing-step-requirements-mobile"
                }
                onClick={() => goToStep(currentStep + 1)}
              >
                <ContinueLabel searching={wizardSearchingAddress} />
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={!continueReady}
                aria-describedby={
                  currentStepReady
                    ? undefined
                    : "listing-step-requirements-mobile"
                }
                onClick={openAvailabilityStart}
              >
                <ContinueLabel
                  searching={false}
                  withoutOffer={!hasLaunchOffer}
                />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* The location editor's phone chrome, and the same shape as the wizard's:
          it has to live at the form root so Preview can switch the pane and still
          offer the way back. It replaces the nav and Publish rows below — while a
          location screen is open there is nowhere else to be. */}
      {locationEditorOpen && (
        <div className="z-30 shrink-0 border-t bg-background px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
          {locationStepIssues.length > 0 && (
            <div className="mb-1.5 flex justify-end">
              <StepRequirementStatus
                id="listing-location-requirements-mobile"
                issues={locationStepIssues}
              />
            </div>
          )}
          <div className="flex items-stretch gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-11 shrink-0 px-0"
              aria-label={resolve("host.form.back", "Back").text}
              onClick={() => goToLocationStep(locationStep! - 1)}
            >
              <ChevronLeft />
            </Button>
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
              {/* Keyed for the same Google Translate reason as the wizard row. */}
              <span key={mobilePane} className="inline-flex items-center gap-1.5">
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
              </span>
            </Button>
            {locationStep === LISTING_STEP.streetView ? (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                onClick={closeLocationEditor}
              >
                <Tx k="host.form.location_done" source="Done" />
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={!locationContinueReady}
                aria-describedby={
                  locationContinueReady
                    ? undefined
                    : "listing-location-requirements-mobile"
                }
                onClick={() => goToLocationStep(locationStep! + 1)}
              >
                <ContinueLabel searching={locationEditorSearchingAddress} />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Only the edit screen needs a nav bar: a draft has no calendar routes to
          go to, so its bar was two pane tabs stacked above two more buttons.
          The wizard folds Preview into its single action row instead. */}
      {showEditSections && (
        <ListingBottomNav
          listingId={listing?.id ?? ""}
          paneOnly={!listing?.id}
          omitPreview
          /* The action row below owns the safe-area inset now. */
          className="pb-0"
          active={mobilePane === "preview" ? "preview" : "edit"}
          onSelectPane={selectMobilePane}
          onNavigate={confirmManagementNavigation}
        />
      )}

      {/* The two commits sit last, under the navigation: Preview swaps the pane and
          Publish saves, and both are actions on the listing rather than places to
          go. Publish stays visible but disabled with nothing to save, so the pair
          keeps a stable shape instead of the row appearing and shifting the nav. */}
      {showEditSections && (
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
                {/* Keyed for the same Google Translate reason as the wizard row. */}
                <span
                  key={mobilePane}
                  className="inline-flex items-center gap-1.5"
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
                </span>
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
                        (issues, stepIndex) => stepIndex < index && issues.length > 0
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
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border-l-2 py-1.5 pl-2.5 pr-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      currentStep === index
                        ? "border-l-primary bg-primary/5"
                        : "border-l-transparent hover:bg-muted disabled:hover:bg-transparent"
                    }`}
                  >
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${currentStep === index ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{step.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
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
          {/* A brand new listing has no blocked dates and one flat nightly rate,
              so the calendar is the most valuable next step — worth a real button
              rather than a sentence, which is also the only shape that survives
              the page being machine-translated. */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground md:text-sm">
              <Tx
                k="host.form.published_calendar_hint"
                source="Want different prices for specific dates, or to block days off? Set them up in your listing's calendar."
              />
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                if (submittedListingId) {
                  router.push(listingStopHref(submittedListingId, "availability"));
                }
              }}
            >
              <CalendarDays className="h-4 w-4" />
              <Tx
                k="host.form.published_calendar_cta"
                source="Set dates, prices & promotions"
              />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                if (submittedListingId) {
                  router.push(`/host/listings/${submittedListingId}/edit`);
                }
              }}
            >
              <Tx k="host.form.continue_editing" source="Continue editing" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => router.push("/host/listings")}
            >
              <Tx k="host.form.go_to_listings" source="Go to My Listings" />
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
  // The mobile action row and the desktop footer are both mounted, so they can't
  // share one id — each points its own aria-describedby at its own copy.
  id = "listing-step-requirements",
}: {
  issues: ListingStepIssue[];
  uploadState?: ListingMediaUploadState;
  id?: string;
}) {
  if (issues.length === 0 && !uploadState) return <span className="ml-auto" />;

  return (
    <div
      id={id}
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
        // One line on phones so the footer stays a single row; the publish
        // checklist sheet is where the full list is readable.
        <p className="flex min-w-0 items-start gap-1.5 text-right text-[0.7rem] leading-tight text-destructive md:text-xs md:leading-relaxed">
          <CircleAlert className="mt-px size-3.5 shrink-0 md:mt-0.5" aria-hidden="true" />
          <span className="line-clamp-1 md:line-clamp-none">
            {issues.map((issue) => issue.message).join(" · ")}
          </span>
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

/** Continue's two faces on the map step: while the pin's address is being looked up
 *  it says so, instead of sitting there greyed out with an unchanged label.
 *
 *  Keyed so React remounts the label rather than mutating its text node — Google
 *  Translate swaps those for its own <font> wrappers, and an in-place update then
 *  lands on a detached node. */
function ContinueLabel({
  searching,
  withoutOffer = false,
}: {
  searching: boolean;
  withoutOffer?: boolean;
}) {
  return (
    <span
      key={searching ? "searching" : "continue"}
      className="inline-flex items-center gap-1.5"
    >
      {searching ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <Tx k="host.form.searching_address" source="Searching address…" />
        </>
      ) : withoutOffer ? (
        <>
          <Tx
            k="host.form.continue_without_offer"
            source="Continue without offer"
          />
          <ChevronRight className="h-4 w-4" />
        </>
      ) : (
        <>
          <Tx k="host.listings.continue" source="Continue" />
          <ChevronRight className="h-4 w-4" />
        </>
      )}
    </span>
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
    <div className="flex min-h-14 items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 md:min-h-[88px] md:gap-4 md:px-4 md:py-4 md:sm:px-6">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary md:size-10 md:rounded-xl">
        <Icon className="size-4 md:size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-sm font-semibold md:text-base">{label}</Label>
        <p className="line-clamp-1 text-[0.7rem] text-muted-foreground md:line-clamp-none md:text-sm">{description}</p>
      </div>
      <div className="flex w-36 shrink-0 items-center gap-1.5 md:w-44 md:gap-2">
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
        <span className="w-14 shrink-0 text-[0.7rem] leading-tight text-muted-foreground md:w-20 md:text-xs">{suffix}</span>
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
    <div className="flex min-h-14 items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 md:min-h-[88px] md:gap-4 md:px-4 md:py-4 md:sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary md:size-10 md:rounded-xl">
          <Icon className="size-4 md:size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-semibold md:text-base">{label}</Label>
          <p className="line-clamp-1 text-[0.7rem] text-muted-foreground md:line-clamp-none md:text-sm">{description}</p>
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
                    {amenities.slice(0, 8).map((amenity) => {
                      const amenityLabel = resolveAmenityLabel({ resolve }, amenity.name);
                      return (
                        <div
                          key={amenity.id}
                          className={cn(
                            "flex items-center gap-2 text-sm",
                            amenityLabel.translated && "notranslate",
                          )}
                        >
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                          {amenityLabel.text}
                        </div>
                      );
                    })}
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
