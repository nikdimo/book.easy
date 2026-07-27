import type { PushRegistration } from "./push-notifications";

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
