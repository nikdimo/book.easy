export interface PushRegistration {
  token: string;
  platform: "ios" | "android";
  deviceName?: string;
}

export async function registerForPushNotifications(): Promise<PushRegistration | null> {
  return null;
}

export async function setApplicationBadge(count: number): Promise<void> {
  void count;
}

export function subscribeToNotificationResponses(
  handler: (route: string) => void
): () => void {
  void handler;
  return () => {};
}
