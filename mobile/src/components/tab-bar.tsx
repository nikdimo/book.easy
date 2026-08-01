import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
// expo-router 57 vendors react-navigation rather than depending on it, so
// @react-navigation/bottom-tabs is not installed. This is the module expo-router
// re-exports the tab types through; the import is type-only, so nothing couples to
// it at runtime.
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { Icon, type IconName } from "@/components/icon";
import { alpha, colors, fonts, radii, shadows, spacing } from "@/theme";

/** Route name → icon. Lives here rather than in screenOptions because the tab
 *  options type has no slot for a custom key, and the bar is the only consumer. */
const TAB_ICONS: Record<string, IconName> = {
  dashboard: "dashboard",
  listings: "listings",
  bookings: "bookings",
  inbox: "inbox",
  admin: "admin",
  more: "more",
};

/** A detached, rounded tab bar rather than a full-width bar welded to the screen
 *  edge. Two reasons beyond looks: content scrolls visibly beneath it, so the list
 *  reads as continuing rather than stopping dead, and the active tab can carry a
 *  tinted pill — a much stronger "you are here" than a tint on a 20pt icon.
 *
 *  Built as a custom bar because the stock one cannot round its own corners or float,
 *  and faking it with tabBarStyle leaves the safe-area inset behind. */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  // Screens with `href: null` — the index redirect, and Admin for non-admins — must
  // stay out. Checking `options.href` does not work: expo-router consumes that prop
  // in its layout context and rewrites it as a hidden item style plus a null
  // tabBarButton (see expo-router/build/layouts/TabsClient.js), so `href` is already
  // gone by the time a custom bar reads the descriptor. The display flag is the
  // signal that survives.
  const routes = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options;
    const itemStyle = StyleSheet.flatten(options?.tabBarItemStyle);
    return itemStyle?.display !== "none" && options?.tabBarButton == null;
  });

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.bar}>
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = state.routes[state.index].key === route.key;
          const label =
            typeof options.title === "string" ? options.title : route.name;
          const icon = TAB_ICONS[route.name];

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={[styles.tab, focused && styles.tabActive]}
            >
              <Icon
                color={focused ? colors.primary : colors.muted}
                name={icon ?? "info"}
                size={20}
              />
              <Text
                numberOfLines={1}
                style={[styles.label, focused && styles.labelActive]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: Platform.OS === "web" ? "fixed" : "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  } as never,
  bar: {
    width: "100%",
    maxWidth: 520,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.xs,
    borderRadius: radii.xxl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.float,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: radii.xxl,
  },
  tabActive: { backgroundColor: alpha(colors.primary, 8) },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
  },
  labelActive: { fontFamily: fonts.semiBold, color: colors.primary },
});
