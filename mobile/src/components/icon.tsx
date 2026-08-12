import type { ColorValue } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "@/theme";

/** Every icon the app uses, named for what it means rather than what it looks like.
 *  Screens pick from this list instead of importing the icon set directly, so the
 *  set stays swappable and no screen can reach for an emoji or a text glyph — both
 *  of which render inconsistently across platforms and read as placeholder art. */
export const ICONS = {
  // Navigation
  dashboard: "home",
  listings: "grid",
  bookings: "calendar",
  inbox: "message-square",
  admin: "shield",
  more: "menu",
  // Actions
  add: "plus",
  remove: "minus",
  close: "x",
  check: "check",
  back: "chevron-left",
  forward: "chevron-right",
  external: "external-link",
  retry: "refresh-cw",
  trash: "trash-2",
  hide: "eye-off",
  preview: "eye",
  users: "users",
  search: "search",
  language: "globe",
  property: "home",
  availability: "calendar",
  pricing: "dollar-sign",
  promotions: "percent",
  // Status
  bell: "bell",
  alert: "alert-circle",
  info: "info",
  pending: "clock",
  // Notification kinds
  bookingRequest: "calendar",
  confirmed: "check-circle",
  rejected: "x-circle",
  cancelled: "alert-triangle",
  chat: "message-square",
  support: "life-buoy",
  report: "flag",
  updated: "refresh-cw",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  /** ColorValue, not string — navigator callbacks hand back opaque platform colors. */
  color?: ColorValue;
}) {
  // Decorative by default: icons here always sit beside a text label or an
  // accessibilityLabel on the pressable, so announcing them again is noise.
  return (
    <Feather
      accessibilityElementsHidden
      importantForAccessibility="no"
      color={color}
      name={ICONS[name]}
      size={size}
    />
  );
}
