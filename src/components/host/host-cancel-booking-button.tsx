"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hostCancelBookingAction } from "@/lib/actions/booking.actions";
import { toast } from "sonner";

/** Cancelling a confirmed booking should be discouraged (US-08.04) — shown only as an
 * explicit secondary action behind a reason prompt, never as a one-click button. */
export function HostCancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");

  if (!showForm) {
    return (
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setShowForm(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-destructive">
        Cancelling a confirmed booking should only be used for emergencies. A reason is required.
      </p>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-8 text-xs w-56"
        />
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending || !reason.trim()}
          onClick={() => {
            startTransition(async () => {
              const result = await hostCancelBookingAction(bookingId, reason);
              if (result?.error) toast.error(result.error);
              else {
                toast.success("Booking cancelled");
                router.refresh();
              }
            });
          }}
        >
          {isPending ? "..." : "Confirm cancellation"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
          Keep booking
        </Button>
      </div>
    </div>
  );
}
