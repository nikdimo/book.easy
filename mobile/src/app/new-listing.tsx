import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  apiFetch,
  ListingDraftData,
  ListingDraftResponse,
  ListingEditorResponse,
  ListingStep,
  openControlPanel,
} from "@/lib/api";
import { colors, radii, shadows, spacing } from "@/theme";

/** Steps this build edits natively. Everything else the server sends — including a
 *  step added after this app shipped — falls through to the web editor rather than
 *  disappearing from the wizard. Keeping the check on the id, not an index, is what
 *  lets the web flow be reordered without a mobile release. */
const NATIVE_STEPS = new Set([
  "propertyType",
  "description",
  "details",
  "amenities",
  "pricing",
]);

/** Why a step still opens the web editor, so the host isn't just told "not here". */
const WEB_ONLY_REASON: Record<string, string> = {
  photos:
    "Photos stay in the web editor for now so its existing upload, ordering, and cover-photo behavior remains unchanged.",
  location:
    "Map placement stays in the web editor while the native map is being built. Any location already saved in this draft remains untouched.",
  address:
    "Address confirmation stays in the web editor so it keeps matching the pin you placed there.",
  streetView:
    "Street View selection stays in the web editor for now. It is optional, so you can skip it.",
  specialOffer:
    "The launch offer stays in the web editor, where the listing is reviewed and published.",
};

type SaveStatus = "saving" | "saved" | "error";

interface EditorValues {
  title: string;
  description: string;
  propertyType: string;
  maxGuests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  baseNightlyRate: string;
  cleaningFee: string;
  minNights: string;
  amenityIds: string[];
}

const defaultValues: EditorValues = {
  title: "",
  description: "",
  propertyType: "",
  maxGuests: "2",
  bedrooms: "1",
  beds: "1",
  bathrooms: "1",
  baseNightlyRate: "",
  cleaningFee: "0",
  minNights: "1",
  amenityIds: [],
};

function valuesFromDraft(data?: ListingDraftData): EditorValues {
  return {
    title: data?.title ?? "",
    description: data?.description ?? "",
    propertyType: data?.propertyType ?? "",
    maxGuests: data?.maxGuests || "2",
    bedrooms: data?.bedrooms || "1",
    beds: data?.beds || "1",
    bathrooms: data?.bathrooms || "1",
    baseNightlyRate: data?.baseNightlyRate ?? "",
    cleaningFee: data?.cleaningFee || "0",
    minNights: data?.minNights || "1",
    amenityIds: Array.isArray(data?.amenityIds) ? data.amenityIds : [],
  };
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

  function goToStep(stepId: string) {
    setSaveStatus("saving");
    setCurrentStepId(stepId);
    stepIdRef.current = stepId;
    void persist(stepId).catch(() => undefined);
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
              onSelect={(value) => updateField("propertyType", value)}
              t={t}
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
          {NATIVE_STEPS.has(step.id) ? null : (
            <BridgeStep
              title={t("Finish {step} on the web", { step: t(step.title) })}
              description={t(
                WEB_ONLY_REASON[step.id] ??
                  "This step is not available in the app yet. Your draft is saved, so you can finish it in the web editor and come back."
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
          disabled={stepIndex === 0}
          onPress={() => goToStep(steps[stepIndex - 1].id)}
          style={[styles.secondaryButton, stepIndex === 0 && styles.disabled]}
        >
          <Text style={styles.secondaryButtonText}>‹ {t("Back")}</Text>
        </Pressable>
        {!isLastStep ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => goToStep(steps[stepIndex + 1].id)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>{t("Continue")} ›</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void openWebStep()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>{t("Finish in web editor")} ↗</Text>
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
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{number}</Text>
        <Pressable
          accessibilityLabel={`${t("Increase")} ${label}`}
          accessibilityRole="button"
          disabled={number >= max}
          onPress={() => onChange(String(Math.min(max, number + 1)))}
          style={[styles.stepperButton, number >= max && styles.disabled]}
        >
          <Text style={styles.stepperButtonText}>+</Text>
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
                      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
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
        <Text style={styles.bridgeIconText}>↗</Text>
      </View>
      <Text style={styles.bridgeTitle}>{title}</Text>
      <Text style={styles.bridgeText}>{description}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>{action} ↗</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  loadErrorTitle: { color: colors.ink, fontSize: 18, fontWeight: "900" },
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
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  saveStatus: { color: colors.muted, fontSize: 11, marginTop: 4 },
  saveStatusError: { color: colors.danger },
  retryText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
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
    fontWeight: "900",
  },
  stepNumberSelected: { color: colors.primary },
  stepChipText: { color: colors.inkSoft, fontSize: 11, fontWeight: "800" },
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
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "900",
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
    fontWeight: "900",
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
  typeIconText: { color: colors.muted, fontSize: 18, fontWeight: "900" },
  typeIconTextSelected: { color: colors.primary },
  propertyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
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
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: "800" },
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
    fontWeight: "900",
    textAlign: "center",
  },
  disabled: { opacity: 0.35 },
  helperText: { color: colors.muted, fontSize: 12, marginTop: -10 },
  amenityGroups: { gap: spacing.xl },
  categoryTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
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
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  amenityText: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "700" },
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
  bridgeIconText: { color: colors.primary, fontSize: 24, fontWeight: "900" },
  bridgeTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
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
  finishNoticeTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: "900" },
  finishNoticeText: {
    color: colors.primaryDark,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
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
  },
  primaryButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  secondaryButton: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
});
