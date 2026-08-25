"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StartConversationButton({
  bookingId,
  listingId,
  isAuthenticated = true,
  label = "Message",
  variant = "outline",
  iconOnly = false,
  className,
}: {
  bookingId?: string;
  listingId?: string;
  isAuthenticated?: boolean;
  label?: string;
  /** Icon-only renders a round icon button; `label` becomes its accessible name. */
  iconOnly?: boolean;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    if (!isAuthenticated) {
      // Search params come along: a guest sent to log in from a listing they had
      // already picked dates on comes back to those dates, not to a bare listing.
      const callbackUrl =
        typeof window === "undefined"
          ? "/"
          : `${window.location.pathname}${window.location.search}`;
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, listingId }),
      });
      const result = (await response.json()) as {
        conversationId?: string;
        error?: string;
      };
      if (!response.ok || !result.conversationId) {
        throw new Error(result.error || "Could not open the conversation");
      }
      router.push(`/messages/${result.conversationId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open the conversation"
      );
    } finally {
      setPending(false);
    }
  }

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant={variant}
        size="icon"
        aria-label={label}
        title={label}
        disabled={pending}
        onClick={() => void start()}
        className={cn("shrink-0 rounded-full", className)}
      >
        <MessageCircle className="h-[18px] w-[18px]" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      disabled={pending}
      onClick={() => void start()}
      className={className}
    >
      <MessageCircle className="mr-2 h-4 w-4" />
      {pending ? "Opening..." : label}
    </Button>
  );
}
