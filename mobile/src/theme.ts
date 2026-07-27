import { Platform } from "react-native";

export const colors = {
  background: "#F5F6F3",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF1EE",
  border: "#E1E5E0",
  borderStrong: "#CCD3CE",
  ink: "#17282D",
  inkSoft: "#405258",
  muted: "#738187",
  primary: "#326B76",
  primaryDark: "#214E57",
  primarySoft: "#E3F0F2",
  accent: "#F0C36B",
  warm: "#A35C2F",
  warmSoft: "#F8ECE3",
  success: "#267253",
  successSoft: "#E2F2EA",
  danger: "#B13D3D",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 18, xl: 24 };
export const radii = { md: 12, lg: 18, xl: 24, pill: 999 };

export const shadows = {
  card:
    Platform.OS === "web"
      ? { boxShadow: "0 10px 32px rgba(23,40,45,0.06)" }
      : {
          shadowColor: "#17282D",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.06,
          shadowRadius: 18,
          elevation: 2,
        },
};
