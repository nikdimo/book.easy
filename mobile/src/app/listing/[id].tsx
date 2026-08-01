import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon, type IconName } from "@/components/icon";
import {
  EmptyNotice,
  ListRow,
  LoadingState,
  Pill,
  PrimaryButton,
  SoftButton,
  TAB_BAR_CLEARANCE,
} from "@/components/ui";
import { LabeledInput } from "@/components/listing/labeled-input";
import { PhotosField, MIN_PHOTOS, photoCount } from "@/components/listing/photos-field";
import {
  LocationField,
  hasValidPin,
  type LocationValues,
} from "@/components/listing/location-field";
import { AddressField } from "@/components/listing/address-field";
import {
  StreetViewField,
  type StreetViewValues,
} from "@/components/listing/street-view-field";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch, ListingMediaItem, openControlPanel } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

/** Editing an existing listing is an operational workspace, not onboarding. The host
 *  already answered these questions once, so the screen shows every section at a
 *  glance and opens the one they came for — rather than marching them back through
 *  ten steps to change a price. Sections collapse so the whole listing stays
 *  navigable on a narrow phone without a long scroll. */

interface EditorValues extends LocationValues, StreetViewValues {
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
  mediaItems: ListingMediaItem[];
}

interface EditorResponse {
  listing: {
    id: string;
    slug: string;
    status: string;
    moderationNote?: string | null;
    title: string;
    description: string;
    maxGuests: number;
    bedrooms: number;
    bathrooms: number;
    beds: number;
    property: {
      propertyType: string;
      address: string;
      city: string;
      area?: string | null;
      postalCode?: string | null;
      country: string;
      latitude?: number | null;
      longitude?: number | null;
      locationSource?: string | null;
      geocodingProvider?: string | null;
      geocodingPlaceId?: string | null;
      geocodingConfidence?: number | null;
      streetViewHeading?: number | null;
      streetViewPitch?: number | null;
      streetViewPanoId?: string | null;
    };
    pricingRule: {
      baseNightlyRate: number;
      cleaningFee: number;
      minNights: number;
    } | null;
    amenities: { amenityId: string }[];
  };
  mediaItems: ListingMediaItem[];
  propertyTypes: { value: string; label: string; description?: string }[];
  amenities: { id: string; name: string; category: string; icon?: string | null }[];
}

type SectionId =
  | "basics"
  | "photos"
  | "location"
  | "details"
  | "amenities"
  | "pricing";

const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: "basics", label: "Title and description", icon: "listings" },
  { id: "photos", label: "Photos", icon: "preview" },
  { id: "location", label: "Location and arrival", icon: "info" },
  { id: "details", label: "Capacity", icon: "users" },
  { id: "amenities", label: "Amenities", icon: "check" },
  { id: "pricing", label: "Price and minimum stay", icon: "confirmed" },
];

function text(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function valuesFrom(data: EditorResponse): EditorValues {
  const { listing } = data;
  return {
    title: listing.title,
    description: listing.description,
    propertyType: listing.property.propertyType,
    maxGuests: String(listing.maxGuests),
    bedrooms: String(listing.bedrooms),
    beds: String(listing.beds),
    bathrooms: String(listing.bathrooms),
    baseNightlyRate: text(listing.pricingRule?.baseNightlyRate),
    cleaningFee: text(listing.pricingRule?.cleaningFee ?? 0),
    minNights: text(listing.pricingRule?.minNights ?? 1),
    amenityIds: listing.amenities.map((entry) => entry.amenityId),
    mediaItems: data.mediaItems,
    address: listing.property.address,
    city: listing.property.city,
    area: listing.property.area ?? "",
    postalCode: listing.property.postalCode ?? "",
    country: listing.property.country,
    latitude: text(listing.property.latitude),
    longitude: text(listing.property.longitude),
    locationSource: listing.property.locationSource ?? "",
    // A saved listing already has a confirmed location; editing an address field
    // clears this again, exactly as in the wizard.
    locationConfirmed: "true",
    geocodingProvider: listing.property.geocodingProvider ?? "",
    geocodingPlaceId: listing.property.geocodingPlaceId ?? "",
    geocodingConfidence: text(listing.property.geocodingConfidence),
    streetViewHeading: text(listing.property.streetViewHeading),
    streetViewPitch: text(listing.property.streetViewPitch),
    streetViewPanoId: listing.property.streetViewPanoId ?? "",
  };
}

export default function EditListingScreen() {
  const router = useRouter();
  const describeError = useApiError();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [data, setData] = useState<EditorResponse | null>(null);
  const [values, setValues] = useState<EditorValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SectionId | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const savedRef = useRef<string>("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const result = await apiFetch<EditorResponse>(
        `/api/mobile/v1/listings/${encodeURIComponent(id)}/editor`
      );
      const next = valuesFrom(result);
      setData(result);
      setValues(next);
      savedRef.current = JSON.stringify(next);
      setDirty(false);
    } catch (caught) {
      setError(describeError(caught, "Could not load this listing"));
    }
  }, [describeError, id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function patch(next: Partial<EditorValues>) {
    setValues((current) => {
      if (!current) return current;
      const merged = { ...current, ...next };
      setDirty(JSON.stringify(merged) !== savedRef.current);
      return merged;
    });
  }

  const problems = useMemo(() => {
    if (!values) return [];
    const found: string[] = [];
    if (!values.propertyType) found.push("Choose a property type");
    if (photoCount(values.mediaItems) < MIN_PHOTOS)
      found.push(`Add at least ${MIN_PHOTOS} photos`);
    if (values.title.trim().length < 5) found.push("Title needs at least 5 characters");
    if (values.description.trim().length < 20)
      found.push("Description needs at least 20 characters");
    if (!hasValidPin(values)) found.push("Place the pin on the map");
    if (!values.address.trim() || !values.city.trim() || !values.country.trim())
      found.push("Complete the address");
    if (!(Number(values.baseNightlyRate) >= 1)) found.push("Set a nightly rate");
    return found;
  }, [values]);

  async function save() {
    if (!id || !values || saving || problems.length > 0) return;
    try {
      setSaving(true);
      await apiFetch(`/api/mobile/v1/listings/${encodeURIComponent(id)}/editor`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      savedRef.current = JSON.stringify(values);
      setDirty(false);
      Alert.alert(t("Changes published"), t("Your listing has been updated."));
    } catch (caught) {
      Alert.alert(
        t("Could not save"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setSaving(false);
    }
  }

  function leave() {
    // Unpublished edits are lost on exit, so make that the host's decision.
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(
      t("Leave without publishing?"),
      t("Your changes have not been published yet and will be lost."),
      [
        { text: t("Keep editing"), style: "cancel" },
        { text: t("Discard"), style: "destructive", onPress: () => router.back() },
      ]
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <EmptyNotice
          icon="alert"
          title="Listing unavailable"
          description={error}
          onRetry={load}
        />
      </View>
    );
  }

  if (!data || !values) {
    return (
      <View style={styles.centered}>
        <LoadingState />
      </View>
    );
  }

  const grouped = data.amenities.reduce<Record<string, EditorResponse["amenities"]>>(
    (groups, amenity) => {
      (groups[amenity.category] ??= []).push(amenity);
      return groups;
    },
    {}
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={styles.title}>
              {values.title || t("Untitled listing")}
            </Text>
            <View style={styles.statusRow}>
              <Pill
                label={data.listing.status}
                tone={data.listing.status === "APPROVED" ? "success" : "neutral"}
              />
              {dirty ? <Pill label="Unpublished changes" tone="warning" /> : null}
            </View>
          </View>
        </View>

        {data.listing.moderationNote ? (
          <View style={styles.moderation}>
            <Icon color={colors.warm} name="alert" size={15} />
            <Text style={styles.moderationText}>{data.listing.moderationNote}</Text>
          </View>
        ) : null}

        {SECTIONS.map((section) => {
          const expanded = open === section.id;
          return (
            <View key={section.id} style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : section.id)}
                style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.6 }]}
              >
                <Icon color={colors.ink} name={section.icon} size={18} />
                <Text style={styles.sectionLabel}>{t(section.label)}</Text>
                <Icon
                  color={colors.muted}
                  name={expanded ? "remove" : "add"}
                  size={16}
                />
              </Pressable>

              {expanded ? (
                <View style={styles.sectionBody}>
                  {section.id === "basics" ? (
                    <>
                      <Text style={styles.fieldGroupLabel}>{t("Property type")}</Text>
                      <View style={styles.chips}>
                        {data.propertyTypes.map((option) => {
                          const selected = values.propertyType === option.value;
                          return (
                            <Pressable
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              key={option.value}
                              onPress={() => patch({ propertyType: option.value })}
                              style={[styles.chip, selected && styles.chipSelected]}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  selected && styles.chipTextSelected,
                                ]}
                              >
                                {t(option.label)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <LabeledInput
                        label={t("Title")}
                        maxLength={100}
                        value={values.title}
                        onChangeText={(value) => patch({ title: value })}
                      />
                      <LabeledInput
                        label={t("Description")}
                        maxLength={5000}
                        multiline
                        value={values.description}
                        onChangeText={(value) => patch({ description: value })}
                      />
                    </>
                  ) : null}

                  {section.id === "photos" ? (
                    <PhotosField
                      items={values.mediaItems}
                      onChange={(next) => patch({ mediaItems: next })}
                      onUploadingChange={setUploading}
                    />
                  ) : null}

                  {/* Map, address and Street View sit together here rather than as
                      three steps — when editing, they are one subject. */}
                  {section.id === "location" ? (
                    <View style={styles.stack}>
                      <LocationField values={values} onChange={patch} />
                      <AddressField values={values} onChange={patch} />
                      <StreetViewField
                        location={values}
                        values={values}
                        onChange={patch}
                      />
                    </View>
                  ) : null}

                  {section.id === "details" ? (
                    <View style={styles.stack}>
                      {(
                        [
                          ["maxGuests", "Guests"],
                          ["bedrooms", "Bedrooms"],
                          ["beds", "Beds"],
                          ["bathrooms", "Bathrooms"],
                        ] as const
                      ).map(([field, label]) => (
                        <LabeledInput
                          key={field}
                          label={t(label)}
                          keyboardType="number-pad"
                          value={values[field]}
                          onChangeText={(value) => patch({ [field]: value })}
                        />
                      ))}
                    </View>
                  ) : null}

                  {section.id === "amenities" ? (
                    <View style={styles.stack}>
                      {Object.entries(grouped).map(([category, list]) => (
                        <View key={category}>
                          <Text style={styles.fieldGroupLabel}>{t(category)}</Text>
                          <View style={styles.chips}>
                            {list.map((amenity) => {
                              const selected = values.amenityIds.includes(amenity.id);
                              return (
                                <Pressable
                                  accessibilityRole="checkbox"
                                  accessibilityState={{ checked: selected }}
                                  key={amenity.id}
                                  onPress={() =>
                                    patch({
                                      amenityIds: selected
                                        ? values.amenityIds.filter(
                                            (value) => value !== amenity.id
                                          )
                                        : [...values.amenityIds, amenity.id],
                                    })
                                  }
                                  style={[styles.chip, selected && styles.chipSelected]}
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      selected && styles.chipTextSelected,
                                    ]}
                                  >
                                    {t(amenity.name)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {section.id === "pricing" ? (
                    <View style={styles.stack}>
                      <LabeledInput
                        label={t("Nightly rate (EUR)")}
                        keyboardType="decimal-pad"
                        value={values.baseNightlyRate}
                        onChangeText={(value) => patch({ baseNightlyRate: value })}
                      />
                      <LabeledInput
                        label={t("Cleaning fee (EUR)")}
                        keyboardType="decimal-pad"
                        value={values.cleaningFee}
                        onChangeText={(value) => patch({ cleaningFee: value })}
                      />
                      <LabeledInput
                        label={t("Minimum nights")}
                        keyboardType="number-pad"
                        value={values.minNights}
                        onChangeText={(value) => patch({ minNights: value })}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        <Text style={styles.groupTitle}>{t("Calendar")}</Text>
        <ListRow
          icon="bookings"
          label="Availability, pricing and promotions"
          onPress={() =>
            router.push({ pathname: "/availability/[id]", params: { id: data.listing.id } })
          }
        />
        <ListRow
          icon="preview"
          label="View public page"
          onPress={() => void openControlPanel(`/properties/${data.listing.slug}`)}
        />

        {problems.length ? (
          <View style={styles.problems}>
            <Text style={styles.problemsTitle}>{t("Fix before publishing")}</Text>
            {problems.map((problem) => (
              <Text key={problem} style={styles.problemText}>
                {t(problem)}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <SoftButton label="Close" tone="neutral" onPress={leave} />
        <View style={{ flex: 1 }}>
          <PrimaryButton
            label={saving ? "Publishing…" : dirty ? "Publish changes" : "Published"}
            disabled={!dirty || saving || uploading || problems.length > 0}
            onPress={() => void save()}
          />
        </View>
        {saving ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", padding: spacing.xl },
  content: {
    padding: spacing.xl,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: spacing.sm,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { ...type.title, color: colors.ink },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  moderation: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.warmSoft,
    marginBottom: spacing.sm,
  },
  moderationText: { ...type.meta, flex: 1, color: colors.warm },
  section: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  sectionHead: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sectionLabel: { ...type.bodyStrong, flex: 1, color: colors.ink },
  sectionBody: {
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stack: { gap: spacing.md },
  fieldGroupLabel: { ...type.label, color: colors.inkSoft },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { ...type.meta, color: colors.inkSoft },
  chipTextSelected: { color: colors.primaryDark },
  groupTitle: { ...type.section, color: colors.ink, marginTop: spacing.xl },
  problems: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.warmSoft,
    marginTop: spacing.md,
  },
  problemsTitle: { ...type.label, color: colors.warm },
  problemText: { ...type.meta, color: colors.warm },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
