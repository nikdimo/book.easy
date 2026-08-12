"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CountBadge } from "@/components/communication/attention-indicator";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  route: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || document.visibilityState !== "visible") return;
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      notifications: NotificationItem[];
      unreadCount: number;
    };
    setItems(data.notifications);
    setUnreadCount(data.unreadCount);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const poller = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poller);
    };
  }, [enabled, refresh]);

  async function open(item: NotificationItem) {
    if (!item.readAt) {
      await fetch(`/api/notifications/${item.id}`, { method: "PATCH" });
      setUnreadCount((count) => Math.max(0, count - 1));
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, readAt: new Date().toISOString() }
            : entry
        )
      );
    }
    if (item.route) router.push(item.route);
  }

  return (
    <Popover onOpenChange={(open) => open && void refresh()}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={`Notifications, ${unreadCount} unread`}
        >
          <Bell className="size-[18px]" />
          <CountBadge
            value={unreadCount}
            label="unread notifications"
            className="absolute -right-1 -top-1"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          {unreadCount > 0 ? (
            <button
              className="text-xs text-primary hover:underline"
              onClick={async () => {
                await fetch("/api/notifications", { method: "PATCH" });
                setUnreadCount(0);
                setItems((current) =>
                  current.map((item) => ({
                    ...item,
                    readAt: item.readAt ?? new Date().toISOString(),
                  }))
                );
              }}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length ? (
            items.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void open(item)}
                className="block w-full border-b px-4 py-3 text-left hover:bg-muted/60"
              >
                <span className="flex items-start gap-2">
                  {!item.readAt ? (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  ) : (
                    <span className="w-2 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.body}
                    </span>
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              You are all caught up.
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          className="w-full rounded-none"
          onClick={() => router.push("/account/notifications")}
        >
          View all notifications
        </Button>
      </PopoverContent>
    </Popover>
  );
}
