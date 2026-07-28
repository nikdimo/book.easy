"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StartConversationButton({
  bookingId,
  listingId,
  isAuthenticated = true,
  label = "Message",
  variant = "outline",
}: {
  bookingId?: string;
  listingId?: string;
  isAuthenticated?: boolean;
  label?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    if (!isAuthenticated) {
      const callbackUrl =
        typeof window === "undefined" ? "/" : window.location.pathname;
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

  return (
    <Button type="button" variant={variant} disabled={pending} onClick={() => void start()}>
      <MessageCircle className="mr-2 h-4 w-4" />
      {pending ? "Opening..." : label}
    </Button>
  );
}
