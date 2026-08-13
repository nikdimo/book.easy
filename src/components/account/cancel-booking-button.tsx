"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelBookingAction } from "@/lib/actions/booking.actions";
import { toast } from "sonner";
import { Tx, useI18n } from "@/lib/i18n/client";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const { resolve } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        <Tx k="account.booking.cancel" source="Cancel Booking" />
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-destructive"><Tx k="account.booking.cancel_confirm" source="Are you sure you want to cancel this booking?" /></p>
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
                toast.success(resolve("account.booking.cancelled", "Booking cancelled").text);
                router.refresh();
              }
            });
          }}
        >
          {isPending
            ? resolve("account.booking.cancelling", "Cancelling...").text
            : resolve("account.booking.yes_cancel", "Yes, cancel").text}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
          <Tx k="account.booking.keep" source="Keep booking" />
        </Button>
      </div>
    </div>
  );
}
