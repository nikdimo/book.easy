import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii, spacing, type } from "@/theme";

/** The single text input used across the wizard and the editor, so field height,
 *  focus treatment and label rhythm stay identical everywhere. */
export function LabeledInput({
  label,
  hint,
  error,
  multiline = false,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          multiline && styles.textarea,
          error ? styles.inputError : null,
          props.style,
        ]}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  label: { ...type.label, color: colors.ink },
  input: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.ink,
    ...type.body,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  textarea: { minHeight: 140, textAlignVertical: "top" },
  hint: { ...type.caption, color: colors.muted },
  error: { ...type.caption, color: colors.danger },
});
