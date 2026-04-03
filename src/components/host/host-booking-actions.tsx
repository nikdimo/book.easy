"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

async function confirmBookingAction(bookingId: string) {
  const res = await fetch("/api/host/bookings/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId }),
  });
  return res.json();
}

async function rejectBookingAction(bookingId: string) {
  const res = await fetch("/api/host/bookings/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId }),
  });
  return res.json();
}

export function HostBookingActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await confirmBookingAction(bookingId);
            if (result.error) toast.error(result.error);
            else { toast.success("Booking confirmed!"); router.refresh(); }
          });
        }}
      >
        <Check className="h-4 w-4 mr-1" />
        Confirm
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await rejectBookingAction(bookingId);
            if (result.error) toast.error(result.error);
            else { toast.success("Booking rejected"); router.refresh(); }
          });
        }}
      >
        <X className="h-4 w-4 mr-1" />
        Reject
      </Button>
    </div>
  );
}
