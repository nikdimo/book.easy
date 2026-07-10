"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { confirmBookingAction, rejectBookingAction } from "@/lib/actions/booking.actions";

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
