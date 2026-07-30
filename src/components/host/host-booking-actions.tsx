"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmBookingAction,
  rejectBookingAction,
} from "@/lib/actions/booking.actions";

export function HostBookingActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"accept" | "decline" | null>(null);
  const [reason, setReason] = useState("");

  function submit() {
    if (!decision) return;
    startTransition(async () => {
      const result =
        decision === "accept"
          ? await confirmBookingAction(bookingId)
          : await rejectBookingAction(bookingId, reason.trim());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(decision === "accept" ? "Booking confirmed" : "Request declined");
      setDecision(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDecision("accept")}>
          <Check className="mr-1 h-4 w-4" />
          Accept request
        </Button>
        <Button variant="outline" onClick={() => setDecision("decline")}>
          <X className="mr-1 h-4 w-4" />
          Decline
        </Button>
      </div>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "accept" ? "Confirm this booking?" : "Decline this request?"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {decision === "accept"
                ? "The guest will be notified immediately and the reservation will become confirmed."
                : "Tell the guest why you cannot host them. Their dates will be released immediately."}
            </p>
          </DialogHeader>
          {decision === "decline" ? (
            <Textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Brief reason for declining (required)"
              maxLength={500}
            />
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Go back</Button>
            </DialogClose>
            <Button
              variant={decision === "decline" ? "destructive" : "default"}
              disabled={isPending || (decision === "decline" && !reason.trim())}
              onClick={submit}
            >
              {isPending
                ? "Saving…"
                : decision === "accept"
                  ? "Confirm booking"
                  : "Decline request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
