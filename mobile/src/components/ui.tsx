import { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useNotifications } from "@/context/notification-context";
import { useLanguage } from "@/context/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { Icon, type IconName } from "@/components/icon";
import { alpha, colors, fonts, radii, shadows, spacing, type } from "@/theme";

/** Room for the floating tab bar to clear the last row of content. */
export const TAB_BAR_CLEARANCE = 104;

/** The frame every screen sits in.
 *
 *  Reworked around the reference's hierarchy: one large title carrying the page,
 *  utilities reduced to small circular controls on a row above it, and no eyebrow
 *  label. The old header spent roughly 150pt before any content — an uppercase
 *  eyebrow, a 29pt title and a subtitle — which on a 375pt-wide phone pushed real
 *  content below the fold on every single screen. */
export function AppScreen({
  title,
  subtitle,
  action,
  onRefresh,
  refreshing = false,
  /** Rendered flush under the header, outside the padded body — for a full-bleed
   *  filter row that should scroll off the edge rather than be inset. */
  sticky,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  sticky?: ReactNode;
  /** Accepted and ignored: screens still pass it, and the redesign drops it. */
  eyebrow?: string;
}>) {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      <View style={styles.utilityRow}>
        <LanguageSelector compact />
        <Pressable
          accessibilityLabel={`${t("Notifications")}, ${unreadCount} ${t("unread")}`}
          accessibilityRole="button"
          onPress={() => router.push("/notifications")}
          style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
        >
          <Icon color={colors.ink} name="bell" size={18} />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t(title)}</Text>
          {subtitle ? <Text style={styles.subtitle}>{t(subtitle)}</Text> : null}
        </View>
        {action}
      </View>

      {sticky}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

/** The filter row from the reference: active segment filled ink, the rest quiet.
 *  Counts live inside the label after a middot, so the row reads as a sentence and
 *  needs no separate badge. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useLanguage();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.segmentRow}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
              {t(option.label)}
              {typeof option.count === "number" ? ` · ${option.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Grouped navigation, as in the reference's "Your rental" / "Help and support"
 *  lists. An icon and a label on a tall touch row beats a card per destination —
 *  ten of these fit where four cards did. */
export function ListRow({
  icon,
  label,
  detail,
  tone = "default",
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  tone?: "default" | "danger";
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const ink = tone === "danger" ? colors.danger : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      <Icon color={ink} name={icon} size={20} />
      <Text style={[styles.listLabel, { color: ink }]}>{t(label)}</Text>
      {detail ? <Text style={styles.listDetail}>{detail}</Text> : null}
      <Icon color={colors.muted} name="forward" size={16} />
    </Pressable>
  );
}

/** Quiet section break. Bold, generous space above, no divider rule — the space
 *  does that work. */
export function SectionHeader({ title, count }: { title: string; count?: number }) {
  const { t } = useLanguage();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{t(title)}</Text>
      {typeof count === "number" ? (
        <Text style={styles.sectionCount}>{count}</Text>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  onPress,
}: PropsWithChildren<{ onPress?: () => void }>) {
  if (!onPress) return <View style={styles.card}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/** Tinted, low-commitment action — the reference's Call / Message pair. */
export function SoftButton({
  label,
  icon,
  tone = "primary",
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: IconName;
  tone?: "primary" | "danger" | "neutral";
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const ink =
    tone === "danger" ? colors.danger : tone === "neutral" ? colors.ink : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.softButton,
        { backgroundColor: alpha(ink, 8) },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Icon color={ink} name={icon} size={16} /> : null}
      <Text style={[styles.softButtonText, { color: ink }]}>{t(label)}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  icon,
  compact = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: IconName;
  compact?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.primaryButtonCompact,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Icon color="#fff" name={icon} size={16} /> : null}
      <Text style={styles.primaryButtonText}>{t(label)}</Text>
    </Pressable>
  );
}

/** Compact metric. Four of these fit on one row of a narrow phone, where the old
 *  2×2 grid of 116pt cards filled the viewport on its own. */
export function StatTile({
  icon,
  label,
  value,
  accent,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: number | string;
  /** Only for tiles whose colour means something. Colour everything and nothing
   *  stands out. */
  accent?: string;
  onPress?: () => void;
}) {
  const { t } = useLanguage();
  const tint = accent ?? colors.primary;
  const content = (
    <>
      <View style={[styles.statIcon, { backgroundColor: alpha(tint, 10) }]}>
        <Icon color={tint} name={icon} size={16} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text numberOfLines={2} style={styles.statLabel}>
        {t(label)}
      </Text>
    </>
  );
  if (!onPress) return <View style={styles.statTile}>{content}</View>;
  return (
    <Pressable
      accessibilityLabel={`${t(label)}: ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.statTile, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function LoadingState() {
  const { t } = useLanguage();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingText}>{t("Loading")}…</Text>
    </View>
  );
}

export function EmptyNotice({
  title,
  description,
  actionLabel = "Try again",
  icon = "info",
  onRetry,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  icon?: IconName;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon color={colors.primary} name={icon} size={20} />
      </View>
      <Text style={styles.emptyTitle}>{t(title)}</Text>
      <Text style={styles.emptyDescription}>{t(description)}</Text>
      {onRetry ? <SoftButton label={actionLabel} onPress={onRetry} /> : null}
    </View>
  );
}

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const { t } = useLanguage();
  const [bg, fg] = {
    neutral: [colors.surfaceAlt, colors.inkSoft],
    success: [colors.successSoft, colors.success],
    warning: [colors.warmSoft, colors.warm],
    danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{t(label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: spacing.xl,
    paddingBottom: TAB_BAR_CLEARANCE,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    backgroundColor: colors.background,
  },
  body: { paddingHorizontal: spacing.xl },
  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  badge: {
    position: "absolute",
    right: -2,
    top: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: fonts.bold },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1 },
  title: { ...type.display, color: colors.ink },
  subtitle: { ...type.meta, color: colors.muted, marginTop: spacing.xs },
  segmentRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  segment: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { ...type.label, color: colors.inkSoft },
  segmentTextActive: { color: "#fff" },
  listRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  listLabel: { ...type.bodyStrong, flex: 1 },
  listDetail: { ...type.meta, color: colors.muted },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...type.section, color: colors.ink },
  sectionCount: { ...type.meta, color: colors.muted },
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  softButton: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
  },
  softButtonText: { ...type.label },
  primaryButton: {
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
  },
  primaryButtonCompact: { minHeight: 40, paddingHorizontal: spacing.lg },
  primaryButtonText: { ...type.label, color: "#fff" },
  statTile: {
    flex: 1,
    minWidth: 76,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  statIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  statValue: { ...type.title, color: colors.ink },
  statLabel: { ...type.caption, color: colors.muted },
  loading: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { ...type.meta, color: colors.muted },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...type.bodyStrong, color: colors.ink, textAlign: "center" },
  emptyDescription: {
    ...type.meta,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 320,
    marginBottom: spacing.sm,
  },
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  pillText: { ...type.caption, fontSize: 11 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
