"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { releaseClaimToRecipientAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";

export function ClaimReleaseButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function release() {
    setPending(true);
    const result = await releaseClaimToRecipientAction(caseId);
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success("Payment request sent to the other party");
    router.refresh();
  }
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <h2 className="font-semibold">Initial claim approval</h2>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">
        Confirm the amount, reason, booking, and evidence before releasing this request.
        The recipient will have 72 hours to respond.
      </p>
      <Button disabled={pending} onClick={() => void release()}>
        {pending ? "Sending..." : "Approve and send to recipient"}
      </Button>
    </div>
  );
}
