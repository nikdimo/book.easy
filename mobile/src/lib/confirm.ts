import { Alert, Platform } from "react-native";

export function confirmAction(
  title: string,
  message: string,
  labels: { cancel: string; confirm: string },
  onConfirm: () => void,
  destructive = false
) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: labels.cancel, style: "cancel" },
    {
      text: labels.confirm,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}
