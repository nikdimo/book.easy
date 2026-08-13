"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  route: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
}

export function NotificationList({
  initial,
}: {
  initial: NotificationItem[];
}) {
  const { requestedLocale } = useI18n();
  const [items, setItems] = useState(initial);
  useEffect(() => {
    if (!initial.some((item) => !item.readAt)) return;
    void fetch("/api/notifications", { method: "PATCH" }).then((response) => {
      if (response.ok) {
        setItems((current) =>
          current.map((item) => ({
            ...item,
            readAt: item.readAt ?? new Date().toISOString(),
          }))
        );
      }
    });
  }, [initial]);

  if (!items.length) {
    return (
      <p className="rounded-xl border px-4 py-12 text-center text-muted-foreground">
        <Tx k="notifications.caught_up" source="You are all caught up." />
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.route ?? "#"}
          className={cn(
            "flex gap-3 border-b px-4 py-4 last:border-b-0 hover:bg-muted/50",
            !item.readAt && "bg-primary/5"
          )}
        >
          <span
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              item.readAt ? "bg-transparent" : "bg-primary"
            )}
          />
          <span>
            <span className="block font-medium" data-user-generated-content translate="yes">{item.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              <span data-user-generated-content translate="yes">{item.body}</span>
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(requestedLocale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(item.createdAt))}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
