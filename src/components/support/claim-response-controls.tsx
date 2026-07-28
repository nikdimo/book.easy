"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { respondToClaimAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ClaimResponseControls({
  caseId,
  amount,
  currency,
}: {
  caseId: string;
  amount: number;
  currency: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"ACCEPT" | "REJECT" | "COUNTER" | null>(null);
  const [note, setNote] = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [pending, setPending] = useState(false);

  async function respond() {
    if (!mode) return;
    setPending(true);
    const result = await respondToClaimAction({
      caseId,
      response: mode,
      note,
      counterAmount: mode === "COUNTER" ? Number(counterAmount) : undefined,
    });
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success("Your response was sent");
    router.refresh();
  }

  if (!mode) {
    return (
      <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div>
          <h2 className="font-semibold">Your response is required</h2>
          <p className="text-sm text-muted-foreground">
            Review the evidence before accepting, countering, or rejecting this request.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("ACCEPT")}>
            Accept {amount.toFixed(2)} {currency}
          </Button>
          <Button variant="outline" onClick={() => setMode("COUNTER")}>
            Make counteroffer
          </Button>
          <Button variant="destructive" onClick={() => setMode("REJECT")}>
            Reject
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">
        {mode === "ACCEPT"
          ? "Accept payment request"
          : mode === "COUNTER"
            ? "Make a counteroffer"
            : "Reject payment request"}
      </h2>
      {mode === "COUNTER" ? (
        <div className="space-y-2">
          <Label htmlFor="counter-amount">Counteroffer ({currency})</Label>
          <Input
            id="counter-amount"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            value={counterAmount}
            onChange={(event) => setCounterAmount(event.target.value)}
          />
        </div>
      ) : null}
      {mode !== "ACCEPT" ? (
        <div className="space-y-2">
          <Label htmlFor="claim-response-note">Explanation</Label>
          <Textarea
            id="claim-response-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Explain your response for the other party and the admin."
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Acceptance is recorded immediately. BookEasy will confirm the secure payment
          step separately; this button does not silently charge your card.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={
            pending ||
            (mode !== "ACCEPT" && !note.trim()) ||
            (mode === "COUNTER" && Number(counterAmount) <= 0)
          }
          onClick={() => void respond()}
        >
          {pending ? "Sending..." : "Confirm response"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setMode(null)}>
          Back
        </Button>
      </div>
    </div>
  );
}
