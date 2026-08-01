import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pill, SoftButton } from "@/components/ui";
import { LabeledInput } from "@/components/listing/labeled-input";
import { hasValidPin, type LocationValues } from "@/components/listing/location-field";
import { useLanguage } from "@/context/language-context";
import { hasStreetView } from "@/lib/api";
import { colors, spacing, type } from "@/theme";

export interface StreetViewValues {
  streetViewHeading: string;
  streetViewPitch: string;
  streetViewPanoId: string;
}

/** Optional by design — Street View does not exist everywhere, so this step must
 *  never block progress. Availability is checked against the pin so the host is told
 *  why the controls are inert rather than being left to guess. */
export function StreetViewField({
  location,
  values,
  onChange,
}: {
  location: LocationValues;
  values: StreetViewValues;
  onChange: (patch: Partial<StreetViewValues>) => void;
}) {
  const { t } = useLanguage();
  const [available, setAvailable] = useState<boolean | null>(null);
  const pinned = hasValidPin(location);

  useEffect(() => {
    // No pin means nothing to check. The status below is only rendered when
    // `pinned` is true, so leaving state untouched here avoids a cascading render.
    if (!pinned) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await hasStreetView(
          Number(location.latitude),
          Number(location.longitude)
        );
        if (!cancelled) setAvailable(result);
      } catch {
        // A failed availability check is not a failed step. Leave it unknown and
        // let the host set a heading anyway.
        if (!cancelled) setAvailable(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.latitude, location.longitude, pinned]);

  const heading = Number(values.streetViewHeading) || 0;
  const pitch = Number(values.streetViewPitch) || 0;

  function nudge(field: keyof StreetViewValues, delta: number, min: number, max: number) {
    const current = Number(values[field]) || 0;
    const next = Math.max(min, Math.min(max, current + delta));
    onChange({ [field]: String(next) } as Partial<StreetViewValues>);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        {t(
          "Choose what guests see when they arrive. This step is optional — skip it if the view is not helpful."
        )}
      </Text>

      {!pinned ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {t("Place the pin first to check whether Street View covers this address.")}
          </Text>
        </View>
      ) : (
        <View style={styles.statusRow}>
          <Pill
            label={
              available === null
                ? "Availability unknown"
                : available
                  ? "Street View available"
                  : "Not covered here"
            }
            tone={available ? "success" : available === false ? "neutral" : "warning"}
          />
        </View>
      )}

      <View style={styles.control}>
        <Text style={styles.controlLabel}>
          {t("Heading")} · {heading}°
        </Text>
        <View style={styles.buttons}>
          <SoftButton label="-45°" onPress={() => nudge("streetViewHeading", -45, 0, 359)} />
          <SoftButton label="+45°" onPress={() => nudge("streetViewHeading", 45, 0, 359)} />
        </View>
      </View>

      <View style={styles.control}>
        <Text style={styles.controlLabel}>
          {t("Pitch")} · {pitch}°
        </Text>
        <View style={styles.buttons}>
          <SoftButton label="-10°" onPress={() => nudge("streetViewPitch", -10, -90, 90)} />
          <SoftButton label="+10°" onPress={() => nudge("streetViewPitch", 10, -90, 90)} />
        </View>
      </View>

      <LabeledInput
        label={t("Panorama ID")}
        hint={t("Optional. Pin a specific panorama if the default one is wrong.")}
        value={values.streetViewPanoId}
        onChangeText={(value) => onChange({ streetViewPanoId: value })}
      />

      {values.streetViewHeading || values.streetViewPitch || values.streetViewPanoId ? (
        <SoftButton
          icon="close"
          label="Clear Street View settings"
          tone="neutral"
          onPress={() =>
            onChange({
              streetViewHeading: "",
              streetViewPitch: "",
              streetViewPanoId: "",
            })
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  intro: { ...type.meta, color: colors.muted },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  notice: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.warmSoft },
  noticeText: { ...type.meta, color: colors.warm },
  control: { gap: spacing.sm },
  controlLabel: { ...type.label, color: colors.ink },
  buttons: { flexDirection: "row", gap: spacing.sm },
});
