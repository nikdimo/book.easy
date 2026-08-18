import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLanguage } from "@/context/language-context";
import { PhotosField, MIN_PHOTOS, photoCount } from "@/components/listing/photos-field";
import { LocationField, hasValidPin, type LocationValues } from "@/components/listing/location-field";
import { AddressField } from "@/components/listing/address-field";
import { StreetViewField, type StreetViewValues } from "@/components/listing/street-view-field";
import { SpecialOfferField, offerProblems, type OfferValues } from "@/components/listing/special-offer-field";
import { SpaceTypeField } from "@/components/listing/space-type-field";
import {
  apiFetch,
  ListingDraftData,
  ListingDraftResponse,
  ListingEditorResponse,
  ListingMediaItem,
  ListingPrePublishPlan,
  ListingStep,
  openControlPanel,
} from "@/lib/api";
import { colors, radii, shadows, spacing, fonts, type } from "@/theme";
import { marketplaceTodayYmd } from "@/lib/marketplace-date";

/** Every canonical step is edited natively. A step id this build does not recognise
 *  — one added to the web flow after the app shipped — still appears in the wizard
 *  and falls through to the web editor, so reordering or extending the web flow
 *  never strands a host on a screen that is silently missing. */
const NATIVE_STEPS = new Set([
  "propertyType",
  "spaceType",
  "photos",
  "description",
  "location",
  "address",
  "streetView",
  "details",
  "amenities",
  "pricing",
  "specialOffer",
]);

type SaveStatus = "saving" | "saved" | "error";

interface EditorValues extends LocationValues, StreetViewValues, OfferValues {
  title: string;
  description: string;
  propertyType: string;
  spaceType: string;
  maxGuests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  baseNightlyRate: string;
  cleaningFee: string;
  minNights: string;
  amenityIds: string[];
  mediaItems: ListingMediaItem[];
  prePublishPlan: ListingPrePublishPlan;
}

const emptyPrePublishPlan = (): ListingPrePublishPlan => ({
  blocks: [],
  openDates: [],
  datePrices: [],
  offers: [],
  availabilityStart: null,
});

const defaultValues: EditorValues = {
  title: "",
  description: "",
  propertyType: "",
  spaceType: "",
  maxGuests: "2",
  bedrooms: "1",
  beds: "1",
  bathrooms: "1",
  baseNightlyRate: "",
  cleaningFee: "0",
  minNights: "1",
  amenityIds: [],
  mediaItems: [],
  address: "",
  city: "",
  area: "",
  postalCode: "",
  country: "",
  latitude: "",
  longitude: "",
  locationSource: "",
  locationConfirmed: "",
  geocodingProvider: "",
  geocodingPlaceId: "",
  geocodingConfidence: "",
  streetViewHeading: "",
  streetViewPitch: "",
  streetViewPanoId: "",
  promotionType: "NONE",
  promotionPercent: "",
  promotionMinimumNights: "",
  prePublishPlan: emptyPrePublishPlan(),
};

function valuesFromDraft(data?: ListingDraftData): EditorValues {
  return {
    title: data?.title ?? "",
    description: data?.description ?? "",
    propertyType:
      data?.propertyType === "DETACHED_HOUSE" ? "HOUSE" : data?.propertyType ?? "",
    spaceType: data?.spaceType ?? "",
    maxGuests: data?.maxGuests || "2",
    bedrooms: data?.bedrooms || "1",
    beds: data?.beds || "1",
    bathrooms: data?.bathrooms || "1",
    baseNightlyRate: data?.baseNightlyRate ?? "",
    cleaningFee: data?.cleaningFee || "0",
    minNights: data?.minNights || "1",
    amenityIds: Array.isArray(data?.amenityIds) ? data.amenityIds : [],
    // A draft started on the web may already carry media and a located pin.
    mediaItems: Array.isArray(data?.mediaItems) ? data.mediaItems : [],
    address: data?.address ?? "",
    city: data?.city ?? "",
    area: data?.area ?? "",
    postalCode: data?.postalCode ?? "",
    country: data?.country ?? "",
    latitude: data?.latitude ?? "",
    longitude: data?.longitude ?? "",
    locationSource: data?.locationSource ?? "",
    locationConfirmed: data?.locationConfirmed ?? "",
    geocodingProvider: data?.geocodingProvider ?? "",
    geocodingPlaceId: data?.geocodingPlaceId ?? "",
    geocodingConfidence: data?.geocodingConfidence ?? "",
    streetViewHeading: data?.streetViewHeading ?? "",
    streetViewPitch: data?.streetViewPitch ?? "",
    streetViewPanoId: data?.streetViewPanoId ?? "",
    promotionType: data?.promotionType || "NONE",
    promotionPercent: data?.promotionPercent ?? "",
    promotionMinimumNights: data?.promotionMinimumNights ?? "",
    // The server has already normalized this with parsePrePublishPlan. Old drafts
    // have no answer and therefore resume as null, never as available immediately.
    prePublishPlan: data?.prePublishPlan ?? emptyPrePublishPlan(),
  };
}

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validRange(startDate: string, endDate: string): boolean {
  return isValidYmd(startDate) && isValidYmd(endDate) && endDate >= startDate;
}

/** Where to resume a draft, mirroring the server's rule: the stored id wins, and a
 *  bare index is only consulted for drafts saved before ids existed. Such an index
 *  was written against an older step order, so it is clamped rather than trusted —
 *  it lands the host on a reasonable screen with every answer still in place. */
function resumeIndex(
  steps: ListingStep[],
  stepId: unknown,
  legacyIndex: unknown
) {
  if (typeof stepId === "string") {
    const found = steps.findIndex((step) => step.id === stepId);
    if (found >= 0) return found;
  }
  const parsed = typeof legacyIndex === "number" ? legacyIndex : Number(legacyIndex);
  if (!Number.isInteger(parsed)) return 0;
  return Math.min(steps.length - 1, Math.max(0, parsed));
}

export default function NewListingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string | string[] }>();
  const initialDraftId = Array.isArray(params.draft) ? params.draft[0] : params.draft;
  const { t } = useLanguage();
  const [catalog, setCatalog] = useState<ListingEditorResponse | null>(null);
  const [values, setValues] = useState<EditorValues>(defaultValues);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const valuesRef = useRef(values);
  const stepIdRef = useRef(currentStepId);
  const draftIdRef = useRef<string | null>(initialDraftId ?? null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTokenRef = useRef(0);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    stepIdRef.current = currentStepId;
  }, [currentStepId]);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setReady(false);
      const [editor, draft] = await Promise.all([
        apiFetch<ListingEditorResponse>("/api/mobile/v1/listing-editor"),
        initialDraftId
          ? apiFetch<ListingDraftResponse>(
              `/api/mobile/v1/drafts/${encodeURIComponent(initialDraftId)}`
            )
          : Promise.resolve(null),
      ]);
      if (!editor.steps?.length) {
        throw new Error(t("The listing wizard is unavailable right now."));
      }
      setCatalog(editor);

      const startId = draft
        ? editor.steps[
            resumeIndex(editor.steps, draft.data.currentStepId, draft.data.currentStep)
          ].id
        : editor.steps[0].id;
      setCurrentStepId(startId);
      stepIdRef.current = startId;

      if (draft) {
        const nextValues = valuesFromDraft(draft.data);
        setValues(nextValues);
        valuesRef.current = nextValues;
        draftIdRef.current = draft.draftId;
      }
      setSaveStatus("saved");
      setReady(true);
    } catch (caught) {
      setLoadError(
        caught instanceof Error ? caught.message : t("Could not load listing editor")
      );
    }
  }, [initialDraftId, t]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const persist = useCallback((stepOverride?: string) => {
    const token = ++saveTokenRef.current;
    const stepId = stepOverride ?? stepIdRef.current;
    const payload = {
      ...valuesRef.current,
      // Send the id, never an index. An index means whatever the *server's* current
      // order says it means, which is how mobile progress used to resume on the
      // wrong screen in the web wizard.
      ...(stepId ? { currentStepId: stepId } : {}),
    };
    setSaveStatus("saving");

    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const existingId = draftIdRef.current;
        const result = await apiFetch<ListingDraftResponse>(
          existingId
            ? `/api/mobile/v1/drafts/${encodeURIComponent(existingId)}`
            : "/api/mobile/v1/drafts",
          {
            method: existingId ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          }
        );
        if (!existingId) {
          draftIdRef.current = result.draftId;
          router.setParams({ draft: result.draftId });
        }
        if (token === saveTokenRef.current) setSaveStatus("saved");
      })
      .catch((caught) => {
        if (token === saveTokenRef.current) setSaveStatus("error");
        throw caught;
      });

    saveQueueRef.current = task.catch(() => undefined);
    return task;
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void persist().catch(() => undefined);
    }, 900);
    return () => clearTimeout(timer);
  }, [currentStepId, persist, ready, values]);

  function updateField<K extends keyof EditorValues>(
    field: K,
    value: EditorValues[K]
  ) {
    setSaveStatus("saving");
    setValues((current) => ({ ...current, [field]: value }));
  }

  /** The location and offer fields move together — choosing a search result writes
   *  coordinates, address parts and provider metadata in one go — so they patch as a
   *  group rather than field by field. */
  function patchValues(patch: Partial<EditorValues>) {
    setSaveStatus("saving");
    setValues((current) => ({ ...current, ...patch }));
  }

  function goToStep(stepId: string) {
    setSaveStatus("saving");
    setCurrentStepId(stepId);
    stepIdRef.current = stepId;
    void persist(stepId).catch(() => undefined);
  }

  /** Everything that must be true before the server will accept a publish. Shown as
   *  a checklist rather than discovered one error at a time, and each entry names the
   *  step so the host can jump straight to it. The server re-validates all of it. */
  const publishBlockers = useMemo(() => {
    const blockers: { stepId?: string; message: string }[] = [];
    if (!values.propertyType)
      blockers.push({ stepId: "propertyType", message: "Choose a property type" });
    if (!values.spaceType)
      blockers.push({ stepId: "spaceType", message: "Choose what guests will book" });
    if (photoCount(values.mediaItems) < MIN_PHOTOS)
      blockers.push({
        stepId: "photos",
        message: `Add at least ${MIN_PHOTOS} photos`,
      });
    if (values.title.trim().length < 5)
      blockers.push({ stepId: "description", message: "Title needs at least 5 characters" });
    if (values.description.trim().length < 20)
      blockers.push({
        stepId: "description",
        message: "Description needs at least 20 characters",
      });
    if (!hasValidPin(values))
      blockers.push({ stepId: "location", message: "Place the pin on the map" });
    if (!values.address.trim() || !values.city.trim() || !values.country.trim())
      blockers.push({ stepId: "address", message: "Complete the address" });
    if (values.locationConfirmed !== "true")
      blockers.push({ stepId: "address", message: "Confirm the address is correct" });
    if (!(Number(values.baseNightlyRate) >= 1))
      blockers.push({ stepId: "pricing", message: "Set a nightly rate" });
    for (const problem of offerProblems(values, values.cleaningFee)) {
      blockers.push({ stepId: "specialOffer", message: problem });
    }
    const availability = values.prePublishPlan.availabilityStart;
    if (!availability) {
      blockers.push({
        message: "Choose when guests can start booking",
      });
    } else if (availability.mode === "from") {
      if (!isValidYmd(availability.startDate)) {
        blockers.push({
          message: "Choose a valid first booking date",
        });
      } else if (availability.startDate < marketplaceTodayYmd()) {
        blockers.push({
          message: "The first booking date cannot be in the past",
        });
      }
    } else if (
      availability.mode === "selected" &&
      !values.prePublishPlan.openDates.some((range) =>
        validRange(range.startDate, range.endDate)
      )
    ) {
      blockers.push({
        message: "Choose at least one bookable date range",
      });
    }
    return blockers;
  }, [values]);

  const blockedByUpload = uploading;

  async function publish() {
    if (publishBlockers.length > 0 || publishing) return;
    try {
      setPublishing(true);
      // Flush any pending edit first: the server reads the payload sent here, but a
      // failed publish must leave the draft holding the host's latest work.
      await persist().catch(() => undefined);
      const result = await apiFetch<{ listingId: string }>(
        "/api/mobile/v1/listings/publish",
        {
          method: "POST",
          body: JSON.stringify({ ...valuesRef.current, draftId: draftIdRef.current }),
        }
      );
      setPublishedId(result.listingId);
    } catch (caught) {
      Alert.alert(
        t("Could not publish"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setPublishing(false);
    }
  }

  async function openWebStep() {
    try {
      await persist();
      const id = draftIdRef.current;
      await openControlPanel(`/host/listings/new${id ? `?draft=${id}` : ""}`);
    } catch (caught) {
      Alert.alert(
        t("Draft could not be saved"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    }
  }

  const groupedAmenities = useMemo(() => {
    const groups: Record<string, ListingEditorResponse["amenities"]> = {};
    for (const amenity of catalog?.amenities ?? []) {
      (groups[amenity.category] ??= []).push(amenity);
    }
    return groups;
  }, [catalog]);

  if (!ready) {
    return (
      <View style={styles.centered}>
        {loadError ? (
          <>
            <Text style={styles.loadErrorTitle}>{t("Listing editor unavailable")}</Text>
            <Text style={styles.loadErrorText}>{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{t("Try again")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t("Loading")}…</Text>
          </>
        )}
      </View>
    );
  }

  if (publishedId) {
    return (
      <View style={styles.centered}>
        <View style={styles.successIcon}>
          <Icon color={colors.success} name="confirmed" size={30} />
        </View>
        <Text style={styles.successTitle}>{t("Listing published")}</Text>
        <Text style={styles.successBody}>
          {t(
            "Your listing is live and queued for a quick admin review. You can manage availability and pricing from My Listings."
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(tabs)/listings")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>{t("Go to My Listings")}</Text>
        </Pressable>
      </View>
    );
  }

  const steps = catalog?.steps ?? [];
  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId)
  );
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topEyebrow}>{t("NEW LISTING")}</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.saveStatus,
              saveStatus === "error" && styles.saveStatusError,
            ]}
          >
            {t(
              saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "error"
                  ? "Save failed"
                  : "Draft saved"
            )}
          </Text>
        </View>
        {saveStatus === "error" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void persist().catch(() => undefined)}
          >
            <Text style={styles.retryText}>{t("Retry")}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressValue,
            { width: `${((stepIndex + 1) / steps.length) * 100}%` },
          ]}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepNavigation}
      >
        {steps.map((navStep, index) => {
          const selected = index === stepIndex;
          return (
            <Pressable
              key={navStep.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => goToStep(navStep.id)}
              style={[styles.stepChip, selected && styles.stepChipSelected]}
            >
              <Text style={[styles.stepNumber, selected && styles.stepNumberSelected]}>
                {index + 1}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.stepChipText, selected && styles.stepChipTextSelected]}
              >
                {t(navStep.title)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.heading}>
          <Text style={styles.stepLabel}>
            {t("Step")} {stepIndex + 1} {t("of")} {steps.length}
          </Text>
          <Text style={styles.title}>{t(step.title)}</Text>
          <Text style={styles.subtitle}>{t(step.description)}</Text>
        </View>

        <View style={styles.card}>
          {step.id === "propertyType" ? (
            <PropertyTypeStep
              options={catalog?.propertyTypes ?? []}
              selected={values.propertyType}
              onSelect={(value) =>
                patchValues({
                  propertyType: value,
                  spaceType:
                    value === "HOTEL"
                      ? values.spaceType === "ENTIRE_PLACE"
                        ? "ENTIRE_PLACE"
                        : "HOTEL_ROOM"
                      : values.spaceType === "HOTEL_ROOM"
                        ? "ENTIRE_PLACE"
                        : values.spaceType,
                })
              }
              t={t}
            />
          ) : null}
          {step.id === "spaceType" ? (
            <SpaceTypeField
              propertyType={values.propertyType}
              value={values.spaceType}
              onChange={(value) => updateField("spaceType", value)}
            />
          ) : null}
          {step.id === "photos" ? (
            <PhotosField
              items={values.mediaItems}
              onChange={(next) => updateField("mediaItems", next)}
              onUploadingChange={setUploading}
            />
          ) : null}
          {step.id === "location" ? (
            <LocationField values={values} onChange={patchValues} />
          ) : null}
          {step.id === "address" ? (
            <AddressField values={values} onChange={patchValues} />
          ) : null}
          {step.id === "streetView" ? (
            <StreetViewField
              location={values}
              values={values}
              onChange={patchValues}
            />
          ) : null}
          {step.id === "specialOffer" ? (
            <SpecialOfferField
              values={values}
              cleaningFee={values.cleaningFee}
              onChange={patchValues}
            />
          ) : null}
          {step.id === "details" ? (
            <DetailsStep values={values} updateField={updateField} t={t} />
          ) : null}
          {step.id === "amenities" ? (
            <AmenitiesStep
              groups={groupedAmenities}
              selected={values.amenityIds}
              onToggle={(amenityId) =>
                updateField(
                  "amenityIds",
                  values.amenityIds.includes(amenityId)
                    ? values.amenityIds.filter((id) => id !== amenityId)
                    : [...values.amenityIds, amenityId]
                )
              }
              t={t}
            />
          ) : null}
          {step.id === "description" ? (
            <DescriptionStep values={values} updateField={updateField} t={t} />
          ) : null}
          {step.id === "pricing" ? (
            <PricingStep values={values} updateField={updateField} t={t} />
          ) : null}
          {isLastStep ? (
            <AvailabilityStartStep
              plan={values.prePublishPlan}
              onChange={(plan) => updateField("prePublishPlan", plan)}
              t={t}
            />
          ) : null}
          {/* On the final step, show everything still standing between the host and
              publication, each linking to the step that fixes it. */}
          {isLastStep && publishBlockers.length > 0 ? (
            <View style={styles.checklist}>
              <Text style={styles.checklistTitle}>
                {t("Before you can publish")}
              </Text>
              {publishBlockers.map((blocker) => {
                const contents = (
                  <>
                    <Icon color={colors.warm} name="alert" size={14} />
                    <Text style={styles.checklistText}>{t(blocker.message)}</Text>
                    {blocker.stepId ? (
                      <Icon color={colors.muted} name="forward" size={14} />
                    ) : null}
                  </>
                );
                return blocker.stepId ? (
                  <Pressable
                    accessibilityRole="button"
                    key={`${blocker.stepId}-${blocker.message}`}
                    onPress={() => goToStep(blocker.stepId!)}
                    style={({ pressed }) => [
                      styles.checklistRow,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    {contents}
                  </Pressable>
                ) : (
                  // Availability is edited directly above this checklist on the
                  // launch screen, so presenting it as a fake Special-offer link
                  // would send the host to the right pixels for the wrong reason.
                  <View key={`launch-${blocker.message}`} style={styles.checklistRow}>
                    {contents}
                  </View>
                );
              })}
            </View>
          ) : null}

          {NATIVE_STEPS.has(step.id) ? null : (
            <BridgeStep
              title={t("Finish {step} on the web", { step: t(step.title) })}
              description={t(
                "This step was added to the listing flow after this version of the app. Your draft is saved, so you can finish it in the web editor and come back."
              )}
              action={t("Open in web editor")}
              onPress={() => void openWebStep()}
            />
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={stepIndex === 0 || blockedByUpload}
          onPress={() => goToStep(steps[stepIndex - 1].id)}
          style={[
            styles.secondaryButton,
            (stepIndex === 0 || blockedByUpload) && styles.disabled,
          ]}
        >
          <Icon color={colors.ink} name="back" size={15} />
          <Text style={styles.secondaryButtonText}>{t("Back")}</Text>
        </Pressable>
        {!isLastStep ? (
          <Pressable
            accessibilityRole="button"
            // An upload in flight is the one thing that blocks leaving a step:
            // navigating away drops the file with no way to recover it.
            disabled={blockedByUpload}
            onPress={() => goToStep(steps[stepIndex + 1].id)}
            style={[styles.primaryButton, blockedByUpload && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>
              {blockedByUpload ? t("Uploading…") : t("Continue")}
            </Text>
            {blockedByUpload ? null : <Icon color="#fff" name="forward" size={15} />}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={publishBlockers.length > 0 || publishing}
            onPress={() => void publish()}
            style={[
              styles.primaryButton,
              (publishBlockers.length > 0 || publishing) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {publishing ? t("Publishing…") : t("Publish listing")}
            </Text>
            {publishing ? null : <Icon color="#fff" name="check" size={15} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

type Translator = (
  source: string,
  values?: Record<string, string | number>
) => string;

function PropertyTypeStep({
  options,
  selected,
  onSelect,
  t,
}: {
  options: ListingEditorResponse["propertyTypes"];
  selected: string;
  onSelect: (value: string) => void;
  t: Translator;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{t("Choose a property type")}</Text>
      <View
        accessibilityRole="radiogroup"
        style={styles.propertyGrid}
      >
        {options.map((option) => {
          const checked = selected === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              aria-checked={checked}
              onPress={() => onSelect(option.value)}
              style={[styles.propertyCard, checked && styles.propertyCardSelected]}
            >
              <View
                style={[styles.typeIcon, checked && styles.typeIconSelected]}
                aria-hidden
              >
                <Text style={[styles.typeIconText, checked && styles.typeIconTextSelected]}>
                  {option.label.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.propertyTitle}>{t(option.label)}</Text>
              {option.description ? (
                <Text numberOfLines={3} style={styles.propertyDescription}>
                  {t(option.description)}
                </Text>
              ) : null}
              {checked ? <View style={styles.selectedDot} /> : null}
            </Pressable>
          );
        })}
      </View>
      {!selected ? (
        <Text style={styles.validationText}>{t("Property type is required")}</Text>
      ) : null}
    </>
  );
}

function DetailsStep({
  values,
  updateField,
  t,
}: {
  values: EditorValues;
  updateField: <K extends keyof EditorValues>(
    field: K,
    value: EditorValues[K]
  ) => void;
  t: Translator;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{t("Capacity")}</Text>
      <View style={styles.rows}>
        <Stepper
          label={t("Guests")}
          value={values.maxGuests}
          min={1}
          max={20}
          t={t}
          onChange={(value) => updateField("maxGuests", value)}
        />
        <Stepper
          label={t("Bedrooms")}
          value={values.bedrooms}
          min={0}
          max={20}
          t={t}
          onChange={(value) => updateField("bedrooms", value)}
        />
        <Stepper
          label={t("Beds")}
          value={values.beds}
          min={0}
          max={40}
          t={t}
          onChange={(value) => updateField("beds", value)}
        />
        <Stepper
          label={t("Bathrooms")}
          value={values.bathrooms}
          min={0}
          max={20}
          t={t}
          onChange={(value) => updateField("bathrooms", value)}
        />
      </View>
    </>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  t,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  t: Translator;
  onChange: (value: string) => void;
}) {
  const number = Number(value) || 0;
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityLabel={`${t("Decrease")} ${label}`}
          accessibilityRole="button"
          disabled={number <= min}
          onPress={() => onChange(String(Math.max(min, number - 1)))}
          style={[styles.stepperButton, number <= min && styles.disabled]}
        >
          <Icon color={colors.ink} name="remove" size={16} />
        </Pressable>
        <Text style={styles.stepperValue}>{number}</Text>
        <Pressable
          accessibilityLabel={`${t("Increase")} ${label}`}
          accessibilityRole="button"
          disabled={number >= max}
          onPress={() => onChange(String(Math.min(max, number + 1)))}
          style={[styles.stepperButton, number >= max && styles.disabled]}
        >
          <Icon color={colors.ink} name="add" size={16} />
        </Pressable>
      </View>
    </View>
  );
}

function AmenitiesStep({
  groups,
  selected,
  onToggle,
  t,
}: {
  groups: Record<string, ListingEditorResponse["amenities"]>;
  selected: string[];
  onToggle: (amenityId: string) => void;
  t: Translator;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{t("Amenities")}</Text>
      <Text style={styles.helperText}>
        {selected.length} {t(selected.length === 1 ? "amenity selected" : "amenities selected")}
      </Text>
      <View style={styles.amenityGroups}>
        {Object.entries(groups).map(([category, amenities]) => (
          <View key={category}>
            <Text style={styles.categoryTitle}>{t(category)}</Text>
            <View style={styles.amenityGrid}>
              {amenities.map((amenity) => {
                const checked = selected.includes(amenity.id);
                return (
                  <Pressable
                    key={amenity.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    aria-checked={checked}
                    onPress={() => onToggle(amenity.id)}
                    style={[styles.amenity, checked && styles.amenitySelected]}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
                      {checked ? <Icon color="#fff" name="check" size={12} /> : null}
                    </View>
                    <Text style={styles.amenityText}>{t(amenity.name)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

function DescriptionStep({
  values,
  updateField,
  t,
}: {
  values: EditorValues;
  updateField: <K extends keyof EditorValues>(
    field: K,
    value: EditorValues[K]
  ) => void;
  t: Translator;
}) {
  const titleInvalid = values.title.trim().length > 0 && values.title.trim().length < 5;
  const descriptionLength = values.description.trim().length;
  return (
    <>
      <LabeledInput
        label={t("Title")}
        value={values.title}
        placeholder={t("Modern apartment near the center")}
        maxLength={100}
        onChangeText={(value) => updateField("title", value)}
      />
      {titleInvalid ? (
        <Text style={styles.validationText}>
          {t("Title must be at least 5 characters")}
        </Text>
      ) : null}
      <LabeledInput
        label={t("Description")}
        value={values.description}
        placeholder={t(
          "Describe the stay, layout, neighborhood, and what makes it easy to book."
        )}
        maxLength={5000}
        multiline
        onChangeText={(value) => updateField("description", value)}
      />
      <View style={styles.characterLine}>
        {descriptionLength > 0 && descriptionLength < 20 ? (
          <Text style={styles.validationText}>
            {t("Description must be at least 20 characters")}
          </Text>
        ) : (
          <View />
        )}
        <Text
          style={[
            styles.characterCount,
            descriptionLength < 20 && styles.validationText,
          ]}
        >
          {descriptionLength}/20 {t("min")}
        </Text>
      </View>
    </>
  );
}

function PricingStep({
  values,
  updateField,
  t,
}: {
  values: EditorValues;
  updateField: <K extends keyof EditorValues>(
    field: K,
    value: EditorValues[K]
  ) => void;
  t: Translator;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{t("Pricing")}</Text>
      <LabeledInput
        label={t("Nightly rate (EUR)")}
        value={values.baseNightlyRate}
        keyboardType="decimal-pad"
        placeholder="0.00"
        onChangeText={(value) => updateField("baseNightlyRate", value)}
      />
      {values.baseNightlyRate !== "" && Number(values.baseNightlyRate) < 1 ? (
        <Text style={styles.validationText}>{t("Nightly rate is required")}</Text>
      ) : null}
      <LabeledInput
        label={t("Cleaning fee (EUR)")}
        value={values.cleaningFee}
        keyboardType="decimal-pad"
        placeholder="0.00"
        onChangeText={(value) => updateField("cleaningFee", value)}
      />
      <LabeledInput
        label={t("Minimum nights")}
        value={values.minNights}
        keyboardType="number-pad"
        placeholder="1"
        onChangeText={(value) => updateField("minNights", value)}
      />
      <View style={styles.finishNotice}>
        <Text style={styles.finishNoticeTitle}>{t("Ready to publish?")}</Text>
        <Text style={styles.finishNoticeText}>
          {t(
            "Finish Location and Photos in the web editor, review the full listing, then publish it there."
          )}
        </Text>
      </View>
    </>
  );
}

function AvailabilityStartStep({
  plan,
  onChange,
  t,
}: {
  plan: ListingPrePublishPlan;
  onChange: (plan: ListingPrePublishPlan) => void;
  t: Translator;
}) {
  const mode = plan.availabilityStart?.mode ?? null;
  const firstRange = plan.openDates[0] ?? { startDate: "", endDate: "" };

  function selectMode(nextMode: "now" | "from" | "selected") {
    onChange({
      ...plan,
      availabilityStart:
        nextMode === "from"
          ? {
              mode: "from",
              startDate:
                plan.availabilityStart?.mode === "from"
                  ? plan.availabilityStart.startDate
                  : "",
            }
          : { mode: nextMode },
    });
  }

  function updateFirstOpenRange(field: "startDate" | "endDate", value: string) {
    onChange({
      ...plan,
      openDates: [{ ...firstRange, [field]: value }, ...plan.openDates.slice(1)],
    });
  }

  const choices: {
    mode: "now" | "from" | "selected";
    title: string;
    description: string;
  }[] = [
    {
      mode: "now",
      title: "Guests can book immediately",
      description: "Publishing opens future dates except dates you have blocked.",
    },
    {
      mode: "from",
      title: "Guests can book from a date",
      description: "Dates before your chosen day stay blocked.",
    },
    {
      mode: "selected",
      title: "Only on dates I open",
      description: "All dates stay closed except the range you choose below.",
    },
  ];

  return (
    <View style={styles.availabilitySection}>
      <View>
        <Text style={styles.sectionTitle}>{t("When can guests book?")}</Text>
        <Text style={styles.availabilityIntro}>
          {t(
            "Choose before publishing. This determines which nights guests can request right away."
          )}
        </Text>
      </View>
      <View accessibilityRole="radiogroup" style={styles.availabilityChoices}>
        {choices.map((choice) => {
          const selected = mode === choice.mode;
          return (
            <Pressable
              key={choice.mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => selectMode(choice.mode)}
              style={({ pressed }) => [
                styles.availabilityChoice,
                selected && styles.availabilityChoiceSelected,
                pressed && { opacity: 0.72 },
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  selected && styles.radioOuterSelected,
                ]}
              >
                {selected ? <View style={styles.radioInner} /> : null}
              </View>
              <View style={styles.availabilityChoiceCopy}>
                <Text style={styles.availabilityChoiceTitle}>{t(choice.title)}</Text>
                <Text style={styles.availabilityChoiceText}>
                  {t(choice.description)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {mode === "from" ? (
        <LabeledInput
          label={t("First date guests can check in")}
          value={plan.availabilityStart?.mode === "from" ? plan.availabilityStart.startDate : ""}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
          onChangeText={(startDate) =>
            onChange({ ...plan, availabilityStart: { mode: "from", startDate } })
          }
        />
      ) : null}

      {mode === "selected" ? (
        <View style={styles.selectedDateFields}>
          <Text style={styles.availabilityRangeHint}>
            {t("Choose the first bookable range. You can add more ranges from the calendar after publishing.")}
          </Text>
          <LabeledInput
            label={t("First bookable night")}
            value={firstRange.startDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            onChangeText={(value) => updateFirstOpenRange("startDate", value)}
          />
          <LabeledInput
            label={t("Last bookable night")}
            value={firstRange.endDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            onChangeText={(value) => updateFirstOpenRange("endDate", value)}
          />
          {plan.openDates.length > 1 ? (
            <Text style={styles.availabilityRangeHint}>
              {t("Your draft also keeps {count} additional bookable ranges.", {
                count: plan.openDates.length - 1,
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LabeledInput({
  label,
  multiline = false,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.textarea, props.style]}
      />
    </View>
  );
}

function BridgeStep({
  title,
  description,
  action,
  onPress,
}: {
  title: string;
  description: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.bridge}>
      <View style={styles.bridgeIcon}>
        <Icon color={colors.primary} name="external" size={24} />
      </View>
      <Text style={styles.bridgeTitle}>{title}</Text>
      <Text style={styles.bridgeText}>{description}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>{action}</Text>
        <Icon color="#fff" name="external" size={15} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successSoft,
  },
  successTitle: { ...type.title, color: colors.ink, textAlign: "center" },
  successBody: {
    ...type.body,
    maxWidth: 420,
    color: colors.muted,
    textAlign: "center",
  },
  checklist: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.warmSoft,
  },
  checklistTitle: { ...type.label, color: colors.warm },
  checklistRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checklistText: { ...type.meta, flex: 1, color: colors.warm },
  screen: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
  loadErrorTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold },
  loadErrorText: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  topBar: {
    minHeight: 58,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  topEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 1.5,
  },
  saveStatus: { color: colors.muted, fontSize: 11, marginTop: 4 },
  saveStatusError: { color: colors.danger },
  retryText: { color: colors.primary, fontSize: 12, fontFamily: fonts.bold },
  progressTrack: { height: 3, backgroundColor: colors.surfaceAlt },
  progressValue: { height: 3, backgroundColor: colors.primary },
  stepNavigation: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  stepChip: {
    height: 36,
    maxWidth: 164,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  stepChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  stepNumber: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: fonts.bold,
  },
  stepNumberSelected: { color: colors.primary },
  stepChipText: { color: colors.inkSoft, fontSize: 11, fontFamily: fonts.bold },
  stepChipTextSelected: { color: colors.primaryDark },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: 110,
  },
  heading: { paddingVertical: spacing.lg },
  stepLabel: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    lineHeight: 34,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  card: {
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    gap: spacing.lg,
    ...shadows.card,
  },
  sectionTitle: {
    color: colors.inkSoft,
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  propertyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  propertyCard: {
    position: "relative",
    flexGrow: 1,
    flexBasis: 190,
    minHeight: 154,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  propertyCardSelected: {
    borderColor: colors.primary,
    backgroundColor: "#F4F9FA",
  },
  typeIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  typeIconSelected: { backgroundColor: colors.primarySoft },
  typeIconText: { color: colors.muted, fontSize: 18, fontFamily: fonts.bold },
  typeIconTextSelected: { color: colors.primary },
  propertyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  propertyDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  selectedDot: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  validationText: { color: colors.danger, fontSize: 11, lineHeight: 16 },
  rows: { gap: 0 },
  stepperRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepperButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
  stepperButtonText: { color: colors.ink, fontSize: 20, lineHeight: 22 },
  stepperValue: {
    minWidth: 26,
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.bold,
    textAlign: "center",
  },
  disabled: { opacity: 0.35 },
  helperText: { color: colors.muted, fontSize: 12, marginTop: -10 },
  amenityGroups: { gap: spacing.xl },
  categoryTitle: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.bold,
    marginBottom: spacing.sm,
  },
  amenityGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  amenity: {
    flexGrow: 1,
    flexBasis: 210,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  amenitySelected: {
    borderColor: colors.primary,
    backgroundColor: "#F4F9FA",
  },
  checkbox: {
    width: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 5,
  },
  checkboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkmark: { color: "#fff", fontSize: 12, fontFamily: fonts.bold },
  amenityText: { flex: 1, color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  inputGroup: { gap: spacing.sm },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.ink,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  textarea: { minHeight: 150, textAlignVertical: "top" },
  characterLine: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: -10,
  },
  characterCount: { color: colors.muted, fontSize: 11, marginLeft: "auto" },
  bridge: {
    minHeight: 300,
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  bridgeIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: colors.primarySoft,
  },
  bridgeIconText: { color: colors.primary, fontSize: 24, fontFamily: fonts.bold },
  bridgeTitle: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.bold,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  bridgeText: {
    maxWidth: 460,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  finishNotice: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
  },
  finishNoticeTitle: { color: colors.primaryDark, fontSize: 13, fontFamily: fonts.bold },
  finishNoticeText: {
    color: colors.primaryDark,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  availabilitySection: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  availabilityIntro: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  availabilityChoices: { gap: spacing.sm },
  availabilityChoice: {
    minHeight: 72,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  availabilityChoiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  radioOuter: {
    width: 20,
    height: 20,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: 10,
  },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  availabilityChoiceCopy: { flex: 1 },
  availabilityChoiceTitle: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  availabilityChoiceText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  selectedDateFields: { gap: spacing.md },
  availabilityRangeHint: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  footer: {
    minHeight: 72,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    flexDirection: "row",
    gap: spacing.sm
  },
  primaryButtonText: { color: "#fff", fontSize: 12, fontFamily: fonts.bold },
  secondaryButton: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    gap: spacing.sm
  },
  secondaryButtonText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold },
});
