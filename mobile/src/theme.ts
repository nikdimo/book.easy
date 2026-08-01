import { Platform } from "react-native";

/** Palette is unchanged and deliberately so — the brand colours are not signed off
 *  yet, so the redesign takes its cues from layout, type and space instead. The two
 *  additions below are neutrals the old set had no room for. */
export const colors = {
  background: "#FFFFFF",
  /** Page background behind cards, when a screen wants separation. */
  canvas: "#F7F8F6",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F3F0",
  border: "#E8EAE7",
  borderStrong: "#D6DAD5",
  ink: "#17282D",
  inkSoft: "#405258",
  muted: "#6E7C82",
  primary: "#326B76",
  primaryDark: "#214E57",
  primarySoft: "#E9F2F3",
  accent: "#F0C36B",
  warm: "#A35C2F",
  warmSoft: "#F8ECE3",
  success: "#267253",
  successSoft: "#E2F2EA",
  danger: "#B13D3D",
  dangerSoft: "#FBECEC",
};

/** 4pt grid. `xl`/`xxl` carry the generous breathing room the reference leans on —
 *  most of what makes it feel calm is space, not decoration. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 };

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

/** One scale, so a screen never invents its own size. Line heights are baked in —
 *  the single biggest cause of a cramped mobile layout is text set solid. */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  section: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
} as const;

/** Hex + alpha. Used for tinted icon wells and soft buttons so a tint always derives
 *  from the colour it accompanies rather than being a second hardcoded value. */
export function alpha(hex: string, percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const suffix = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${suffix}`;
}

export const shadows = {
  /** Floating chrome — the tab bar. The only place a real shadow is warranted. */
  float:
    Platform.OS === "web"
      ? { boxShadow: "0 6px 24px rgba(23,40,45,0.10)" }
      : {
          shadowColor: "#17282D",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 8,
        },
  /** Cards sit on a hairline border instead of a shadow. Stacked shadows are what
   *  made the old list views feel heavy; the reference uses borders throughout. */
  card:
    Platform.OS === "web"
      ? { boxShadow: "0 1px 2px rgba(23,40,45,0.03)" }
      : {
          shadowColor: "#17282D",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 2,
          elevation: 1,
        },
  sm:
    Platform.OS === "web"
      ? { boxShadow: "0 1px 2px rgba(23,40,45,0.03)" }
      : {
          shadowColor: "#17282D",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 2,
          elevation: 1,
        },
};
