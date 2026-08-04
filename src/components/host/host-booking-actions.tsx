"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmBookingAction,
  rejectBookingAction,
} from "@/lib/actions/booking.actions";
import { Tx, useI18n } from "@/lib/i18n/client";

export function HostBookingActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"accept" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const { resolve } = useI18n();

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
      toast.success(
        decision === "accept"
          ? resolve("host.booking.confirmed_toast", "Booking confirmed").text
          : resolve("host.booking.declined_toast", "Request declined").text,
      );
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
          <Tx k="host.booking.accept" source="Accept request" />
        </Button>
        <Button variant="outline" onClick={() => setDecision("decline")}>
          <X className="mr-1 h-4 w-4" />
          <Tx k="host.booking.decline" source="Decline" />
        </Button>
      </div>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent variant="sheet" className="md:max-w-md">
          <DialogHeader>
            {/* Accepting and declining are one keystroke apart and irreversible, so
                the panel leads with a colour-coded mark: the host should know which
                of the two they opened before reading a word. */}
            <span
              className={`mb-1 grid size-10 place-items-center rounded-full ${
                decision === "decline"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {decision === "decline" ? (
                <X className="h-5 w-5" />
              ) : (
                <Check className="h-5 w-5" />
              )}
            </span>
            <DialogTitle>
              {decision === "accept" ? (
                <Tx k="host.booking.accept_title" source="Confirm this booking?" />
              ) : (
                <Tx k="host.booking.decline_title" source="Decline this request?" />
              )}
            </DialogTitle>
            <DialogDescription>
              {decision === "accept" ? (
                <Tx
                  k="host.booking.accept_body"
                  source="The guest will be notified immediately and the reservation will become confirmed."
                />
              ) : (
                <Tx
                  k="host.booking.decline_body"
                  source="Tell the guest why you cannot host them. Their dates will be released immediately."
                />
              )}
            </DialogDescription>
          </DialogHeader>
          {decision === "decline" ? (
            <div className="flex flex-col gap-1.5">
              <Textarea
                autoFocus
                id="decline-reason"
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  resolve(
                    "host.booking.decline_placeholder",
                    "Brief reason for declining (required)",
                  ).text
                }
                maxLength={500}
                className="resize-none"
              />
              <span
                className="self-end text-xs text-muted-foreground tabular-nums"
                translate="no"
              >
                {reason.length}/500
              </span>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="lg" className="sm:w-auto">
                <Tx k="host.booking.go_back" source="Go back" />
              </Button>
            </DialogClose>
            <Button
              size="lg"
              variant={decision === "decline" ? "destructive" : "default"}
              disabled={isPending || (decision === "decline" && !reason.trim())}
              onClick={submit}
              className="sm:w-auto"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : decision === "decline" ? (
                <X className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isPending
                ? resolve("host.booking.saving", "Saving…").text
                : decision === "accept"
                  ? resolve("host.booking.confirm_action", "Confirm booking").text
                  : resolve("host.booking.decline_action", "Decline request").text}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
