"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { respondToClaimAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tx, useI18n } from "@/lib/i18n/client";

export function ClaimResponseControls({
  caseId,
  amount,
  currency,
}: {
  caseId: string;
  amount: number;
  currency: string;
}) {
  const { resolve } = useI18n();
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
    toast.success(resolve("support.response_sent", "Your response was sent").text);
    router.refresh();
  }

  if (!mode) {
    return (
      <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div>
          <h2 className="font-semibold"><Tx k="support.response_required" source="Your response is required" /></h2>
          <p className="text-sm text-muted-foreground">
            <Tx k="support.response_required_description" source="Review the evidence before accepting, countering, or rejecting this request." />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("ACCEPT")}>
            {resolve("support.accept_amount", "Accept {amount} {currency}").text.replace("{amount}", amount.toFixed(2)).replace("{currency}", currency)}
          </Button>
          <Button variant="outline" onClick={() => setMode("COUNTER")}>
            <Tx k="support.make_counteroffer" source="Make counteroffer" />
          </Button>
          <Button variant="destructive" onClick={() => setMode("REJECT")}>
            <Tx k="support.reject" source="Reject" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">
        {mode === "ACCEPT"
          ? resolve("support.accept_request", "Accept payment request").text
          : mode === "COUNTER"
            ? resolve("support.counteroffer", "Make a counteroffer").text
            : resolve("support.reject_request", "Reject payment request").text}
      </h2>
      {mode === "COUNTER" ? (
        <div className="space-y-2">
          <Label htmlFor="counter-amount">{resolve("support.counteroffer_currency", "Counteroffer ({currency})").text.replace("{currency}", currency)}</Label>
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
          <Label htmlFor="claim-response-note"><Tx k="support.explanation" source="Explanation" /></Label>
          <Textarea
            id="claim-response-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={resolve("support.explanation_placeholder", "Explain your response for the other party and the administrator.").text}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Tx k="support.acceptance_notice_direct" source="Acceptance is recorded immediately. Linger Homes does not collect or hold payments — this button charges nothing, and the amount you agree is settled directly with the other party." />
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
          {pending
            ? resolve("common.sending", "Sending...").text
            : resolve("support.confirm_response", "Confirm response").text}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setMode(null)}>
          <Tx k="common.back" source="Back" />
        </Button>
      </div>
    </div>
  );
}
