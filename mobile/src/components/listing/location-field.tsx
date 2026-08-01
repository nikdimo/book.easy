import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { Pill, SoftButton } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import {
  PlaceSuggestion,
  ResolvedPlace,
  resolvePlace,
  reverseGeocodePoint,
  searchPlaces,
} from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";
import { LabeledInput } from "@/components/listing/labeled-input";

/** What the three location steps read and write. Strings throughout, because that is
 *  how ListingDraftData stores them and the web wizard reads the same shape. */
export interface LocationValues {
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
}

export function hasValidPin(values: Pick<LocationValues, "latitude" | "longitude">) {
  const lat = Number(values.latitude);
  const lng = Number(values.longitude);
  return (
    values.latitude.trim() !== "" &&
    values.longitude.trim() !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** A search session groups an autocomplete run with the place-details call that
 *  follows it, which is how the provider bills and de-duplicates. One token per
 *  search, discarded once a result is chosen. */
function newSessionToken() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function LocationField({
  values,
  onChange,
}: {
  values: LocationValues;
  onChange: (patch: Partial<LocationValues>) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef(newSessionToken());

  // Debounced so a typed query costs one lookup, not one per keystroke — the
  // endpoint is rate-limited to 60 a minute per user.
  useEffect(() => {
    const term = query.trim();
    // Too short to search: nothing to schedule, and nothing to clear either — the
    // render below derives visibility from the query, so no state is touched here.
    // Clearing synchronously would cascade a second render on every keystroke.
    if (term.length < 2) return;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setBusy(true);
          setNotice(null);
          setResults(await searchPlaces(term, sessionRef.current));
        } catch (caught) {
          setNotice(caught instanceof Error ? caught.message : t("Search failed"));
        } finally {
          setBusy(false);
        }
      })();
    }, 400);
    return () => clearTimeout(timer);
  }, [query, t]);

  const applyPlace = useCallback(
    (place: ResolvedPlace, source: string) => {
      onChange({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        locationSource: source,
        // A new pin invalidates any previous confirmation — the host has to look at
        // the address again before it counts as checked.
        locationConfirmed: "",
        geocodingProvider: place.provider ?? "",
        geocodingPlaceId: place.placeId ?? "",
        geocodingConfidence: place.confidence ?? "",
        // Only fill address fields that came back. Blanking a field the host typed
        // by hand is the one thing the web implementation is careful never to do.
        ...(place.address ? { address: place.address } : {}),
        ...(place.city ? { city: place.city } : {}),
        ...(place.area ? { area: place.area } : {}),
        ...(place.postalCode ? { postalCode: place.postalCode } : {}),
        ...(place.country ? { country: place.country } : {}),
      });
    },
    [onChange]
  );

  async function choose(suggestion: PlaceSuggestion) {
    try {
      setBusy(true);
      setNotice(null);
      const place = await resolvePlace(suggestion.placeId, sessionRef.current);
      // Choosing a search result is the explicit action that may overwrite manual
      // address edits, so it is the one path that replaces every field.
      applyPlace(place, "SEARCH");
      sessionRef.current = newSessionToken();
      setResults([]);
      setQuery(suggestion.description);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t("Could not use that place"));
    } finally {
      setBusy(false);
    }
  }

  async function setPinFromDevice() {
    try {
      setBusy(true);
      setNotice(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setNotice(t("Location permission was declined. Search for the address instead."));
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const place = await reverseGeocodePoint(
        position.coords.latitude,
        position.coords.longitude
      );
      applyPlace(
        { ...place, latitude: position.coords.latitude, longitude: position.coords.longitude },
        "DEVICE"
      );
      setNotice(t("Pin set from your current position. Check the address on the next step."));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t("Could not read your location"));
    } finally {
      setBusy(false);
    }
  }

  async function lookUpTypedPin() {
    if (!hasValidPin(values)) return;
    try {
      setBusy(true);
      setNotice(null);
      const place = await reverseGeocodePoint(
        Number(values.latitude),
        Number(values.longitude)
      );
      applyPlace(
        { ...place, latitude: Number(values.latitude), longitude: Number(values.longitude) },
        "MANUAL"
      );
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t("Could not look up that point"));
    } finally {
      setBusy(false);
    }
  }

  const pinned = hasValidPin(values);
  const visibleResults = query.trim().length >= 2 ? results : [];

  return (
    <View style={styles.wrap}>
      <LabeledInput
        label={t("Search for the address")}
        placeholder={t("Street, city, or a place name")}
        value={query}
        onChangeText={setQuery}
      />

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.busyText}>{t("Looking up")}…</Text>
        </View>
      ) : null}

      {visibleResults.length ? (
        <View style={styles.results}>
          {visibleResults.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.placeId}
              onPress={() => void choose(suggestion)}
              style={({ pressed }) => [styles.result, pressed && { opacity: 0.6 }]}
            >
              <Icon color={colors.muted} name="listings" size={16} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.resultTitle}>
                  {suggestion.primaryText ?? suggestion.description}
                </Text>
                {suggestion.secondaryText ? (
                  <Text numberOfLines={1} style={styles.resultMeta}>
                    {suggestion.secondaryText}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <SoftButton
        icon="listings"
        label="Use my current location"
        onPress={() => void setPinFromDevice()}
      />

      <View style={styles.coords}>
        <View style={{ flex: 1 }}>
          <LabeledInput
            label={t("Latitude")}
            keyboardType="decimal-pad"
            placeholder="41.9981"
            value={values.latitude}
            onChangeText={(value) => onChange({ latitude: value, locationConfirmed: "" })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput
            label={t("Longitude")}
            keyboardType="decimal-pad"
            placeholder="21.4254"
            value={values.longitude}
            onChangeText={(value) => onChange({ longitude: value, locationConfirmed: "" })}
          />
        </View>
      </View>

      {pinned ? (
        <SoftButton
          icon="retry"
          label="Look up the address for this point"
          onPress={() => void lookUpTypedPin()}
        />
      ) : null}

      <View style={styles.statusRow}>
        <Pill
          label={pinned ? "Pin placed" : "No pin yet"}
          tone={pinned ? "success" : "warning"}
        />
        {values.geocodingConfidence ? (
          <Pill label={`${t("Confidence")}: ${values.geocodingConfidence}`} />
        ) : null}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.privacy}>
        {t(
          "Guests see the approximate area until a booking is confirmed. The exact address and arrival details are only shared with a confirmed guest."
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  busy: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  busyText: { ...type.meta, color: colors.muted },
  results: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  result: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultTitle: { ...type.body, color: colors.ink },
  resultMeta: { ...type.caption, color: colors.muted, marginTop: 2 },
  coords: { flexDirection: "row", gap: spacing.md },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  notice: { ...type.meta, color: colors.warm },
  privacy: { ...type.caption, color: colors.muted },
});
