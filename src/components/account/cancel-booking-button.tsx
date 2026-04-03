"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelBookingAction } from "@/lib/actions/booking.actions";
import { toast } from "sonner";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        Cancel Booking
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-destructive">Are you sure you want to cancel this booking?</p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const result = await cancelBookingAction(bookingId);
              if (result?.error) {
                toast.error(result.error);
              } else {
                toast.success("Booking cancelled");
                router.refresh();
              }
            });
          }}
        >
          {isPending ? "Cancelling..." : "Yes, cancel"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
          Keep booking
        </Button>
      </div>
    </div>
  );
}
