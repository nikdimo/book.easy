import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { PushRegistration } from "./push-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<PushRegistration | null> {
  if (!Device.isDevice || (Platform.OS !== "ios" && Platform.OS !== "android")) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("booking-and-chat", {
      name: "Bookings and chat",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: "#326B76",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return {
    token,
    platform: Platform.OS,
    deviceName: Device.deviceName ?? undefined,
  };
}

export async function setApplicationBadge(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

export function subscribeToNotificationResponses(
  handler: (route: string) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = response.notification.request.content.data?.route;
    if (typeof route === "string") handler(route);
  });
  return () => subscription.remove();
}
