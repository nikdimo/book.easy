import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLanguage } from "@/context/language-context";
import { colors, radii, spacing, fonts } from "@/theme";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { languages, locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = languages.find((language) => language.code === locale);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return languages;
    return languages.filter((language) =>
      `${language.name} ${language.code}`.toLocaleLowerCase().includes(search)
    );
  }, [languages, query]);

  return (
    <>
      <Pressable
        accessibilityLabel={`${t("Language")}: ${current?.name ?? locale}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          compact && styles.triggerCompact,
          pressed && { opacity: 0.65 },
        ]}
      >
        <Icon color={colors.ink} name="language" size={16} />
        {!compact ? (
          <Text numberOfLines={1} style={styles.triggerText}>
            {current?.name ?? locale.toUpperCase()}
          </Text>
        ) : (
          <Text style={styles.code}>{locale.toUpperCase()}</Text>
        )}
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        visible={open}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{t("Language")}</Text>
              <Text style={styles.modalSubtitle}>
                {t("Choose the language used across the application.")}
              </Text>
            </View>
            <Pressable onPress={() => setOpen(false)} style={styles.close}>
              <Icon color={colors.ink} name="close" size={18} />
            </Pressable>
          </View>
          <TextInput
            autoCapitalize="none"
            onChangeText={setQuery}
            placeholder={t("Search languages")}
            placeholderTextColor={colors.muted}
            style={styles.search}
            value={query}
          />
          <Text style={styles.groupLabel}>{t("Reviewed languages")}</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {filtered.map((language) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: language.code === locale }}
                key={language.code}
                onPress={() => {
                  void setLocale(language.code).then(() => {
                    setOpen(false);
                    setQuery("");
                  });
                }}
                style={({ pressed }) => [
                  styles.option,
                  language.code === locale && styles.optionSelected,
                  pressed && { opacity: 0.65 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionName}>{language.name}</Text>
                  <Text style={styles.optionCode}>{language.code.toUpperCase()}</Text>
                </View>
                {language.code === locale ? <Icon color={colors.primary} name="check" size={16} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 42,
    maxWidth: 170,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  triggerCompact: { width: 48, paddingHorizontal: 0, justifyContent: "center", gap: 1 },
  triggerText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold },
  code: { color: colors.muted, fontSize: 8, fontFamily: fonts.bold },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  modalTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.bold },
  modalSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: colors.ink, fontSize: 26, lineHeight: 28 },
  search: {
    minHeight: 48,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 14,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  list: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm },
  option: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionName: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  optionCode: { color: colors.muted, fontSize: 9, marginTop: 3, letterSpacing: 1 },
  check: { color: colors.primary, fontSize: 18, fontFamily: fonts.bold },
});
