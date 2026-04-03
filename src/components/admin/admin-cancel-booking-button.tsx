"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminCancelBooking } from "@/lib/actions/admin.actions";
import { toast } from "sonner";

export function AdminCancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");

  if (!showForm) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setShowForm(true)}>
        Cancel
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="h-8 text-xs w-40"
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending || !reason.trim()}
        onClick={() => {
          startTransition(async () => {
            const result = await adminCancelBooking(bookingId, reason);
            if (result?.error) toast.error(result.error);
            else { toast.success("Booking cancelled"); router.refresh(); }
          });
        }}
      >
        {isPending ? "..." : "Confirm"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
        X
      </Button>
    </div>
  );
}
