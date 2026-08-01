import { StyleSheet, Text, View } from "react-native";
import { Pill, SoftButton } from "@/components/ui";
import { LabeledInput } from "@/components/listing/labeled-input";
import { hasValidPin, type LocationValues } from "@/components/listing/location-field";
import { useLanguage } from "@/context/language-context";
import { colors, spacing, type } from "@/theme";

/** Review and correct what the lookup returned.
 *
 *  Editing any field clears locationConfirmed, matching the web rule: changed
 *  address text invalidates the previous confirmation. Nothing here re-geocodes —
 *  a deliberate correction must never be silently overwritten by a later automatic
 *  lookup. Only picking a fresh search result on the previous step does that. */
export function AddressField({
  values,
  onChange,
}: {
  values: LocationValues;
  onChange: (patch: Partial<LocationValues>) => void;
}) {
  const { t } = useLanguage();
  const pinned = hasValidPin(values);
  const confirmed = values.locationConfirmed === "true";

  function edit(field: keyof LocationValues, value: string) {
    onChange({ [field]: value, locationConfirmed: "" } as Partial<LocationValues>);
  }

  return (
    <View style={styles.wrap}>
      {!pinned ? (
        <View style={styles.blocker}>
          <Text style={styles.blockerText}>
            {t("Place the pin on the previous step before confirming the address.")}
          </Text>
        </View>
      ) : null}

      <LabeledInput
        label={t("Address")}
        placeholder={t("Street and number")}
        value={values.address}
        onChangeText={(value) => edit("address", value)}
      />
      <LabeledInput
        label={t("City")}
        value={values.city}
        onChangeText={(value) => edit("city", value)}
      />
      <LabeledInput
        label={t("Area or neighbourhood")}
        hint={t("Optional")}
        value={values.area}
        onChangeText={(value) => edit("area", value)}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <LabeledInput
            label={t("Postal code")}
            value={values.postalCode}
            onChangeText={(value) => edit("postalCode", value)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput
            label={t("Country")}
            value={values.country}
            onChangeText={(value) => edit("country", value)}
          />
        </View>
      </View>

      <View style={styles.statusRow}>
        <Pill
          label={confirmed ? "Address confirmed" : "Not confirmed yet"}
          tone={confirmed ? "success" : "warning"}
        />
      </View>

      {!confirmed ? (
        <SoftButton
          icon="check"
          label="This address is correct"
          disabled={!pinned}
          onPress={() => onChange({ locationConfirmed: "true" })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  blocker: {
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.warmSoft,
  },
  blockerText: { ...type.meta, color: colors.warm },
});
