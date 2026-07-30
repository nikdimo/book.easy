import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Href, useRouter } from "expo-router";
import { AppState } from "react-native";
import { useAuth } from "@/context/auth-context";
import {
  apiFetch,
  NotificationSummary,
  NotificationsResponse,
  openControlPanel,
} from "@/lib/api";
import {
  registerForPushNotifications,
  setApplicationBadge,
  subscribeToNotificationResponses,
} from "@/lib/push-notifications";

function nativeRoute(route: string): Href {
  const messageMatch = route.match(/^\/messages\/([^/?#]+)/);
  if (messageMatch) return `/chat/${messageMatch[1]}` as Href;
  if (/^\/host\/bookings(?:\/|$)/.test(route)) return "/(tabs)/bookings" as Href;
  if (/^\/account\/bookings(?:\/|$)/.test(route)) return "/(tabs)/bookings" as Href;
  return route as Href;
}

function isWebOnlyRoute(route: string) {
  return route.startsWith("/account/support") || route.startsWith("/admin/");
}

interface NotificationState {
  notifications: NotificationSummary[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;
  openNotification: (notification: NotificationSummary) => Promise<void>;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const result = await apiFetch<NotificationsResponse>("/api/mobile/v1/notifications");
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      await setApplicationBadge(result.unreadCount);
    } catch {
      // Keep the current badge during brief network interruptions.
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const initial = setTimeout(() => void refreshNotifications(), 0);
    const poller = setInterval(() => void refreshNotifications(), 12_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNotifications();
    });
    return () => {
      clearTimeout(initial);
      clearInterval(poller);
      appState.remove();
    };
  }, [refreshNotifications, user]);

  useEffect(() => {
    if (!user) return;
    void registerForPushNotifications()
      .then((registration) =>
        registration
          ? apiFetch("/api/mobile/v1/push-tokens", {
              method: "POST",
              body: JSON.stringify(registration),
            })
          : null
      )
      .catch(() => {
        // In-app notifications continue to work if push is unavailable or declined.
      });
  }, [user]);

  useEffect(
    () =>
      subscribeToNotificationResponses((route) => {
        if (isWebOnlyRoute(route)) void openControlPanel(route);
        else router.push(nativeRoute(route));
        void refreshNotifications();
      }),
    [refreshNotifications, router]
  );

  const markAllRead = useCallback(async () => {
    await apiFetch("/api/mobile/v1/notifications", { method: "PATCH" });
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      }))
    );
    setUnreadCount(0);
    await setApplicationBadge(0);
  }, []);

  const openNotification = useCallback(
    async (notification: NotificationSummary) => {
      if (!notification.readAt) {
        await apiFetch(`/api/mobile/v1/notifications/${notification.id}`, {
          method: "PATCH",
        });
      }
      await refreshNotifications();
      if (notification.route) {
        if (isWebOnlyRoute(notification.route)) {
          await openControlPanel(notification.route);
        } else {
          router.push(nativeRoute(notification.route));
        }
      }
    },
    [refreshNotifications, router]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      refreshNotifications,
      markAllRead,
      openNotification,
    }),
    [markAllRead, notifications, openNotification, refreshNotifications, unreadCount]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationProvider");
  return value;
}
