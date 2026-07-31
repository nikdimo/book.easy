"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hostCancelBookingAction } from "@/lib/actions/booking.actions";
import { toast } from "sonner";
import { Tx, useI18n } from "@/lib/i18n/client";

/** Cancelling a confirmed booking should be discouraged (US-08.04) — shown only as an
 * explicit secondary action behind a reason prompt, never as a one-click button. */
export function HostCancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const { resolve } = useI18n();

  if (!showForm) {
    return (
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setShowForm(true)}>
        <Tx k="host.cancel_booking.open" source="Cancel booking" />
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-destructive">
        <Tx
          k="host.cancel_booking.warning"
          source="Cancelling a confirmed booking should only be used for emergencies. A reason is required."
        />
      </p>
      <div className="flex items-center gap-2">
        <Input
          placeholder={
            resolve("host.cancel_booking.reason_placeholder", "Reason (required)").text
          }
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-8 text-sm md:text-xs w-56"
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
                toast.success(
                  resolve("host.cancel_booking.success", "Booking cancelled").text,
                );
                router.refresh();
              }
            });
          }}
        >
          {isPending
            ? "..."
            : resolve("host.cancel_booking.confirm", "Confirm cancellation").text}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
          <Tx k="host.cancel_booking.keep" source="Keep booking" />
        </Button>
      </div>
    </div>
  );
}
