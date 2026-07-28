"use client";

import { useState } from "react";
import type { ReviewStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { moderateReviewAction } from "@/lib/actions/review.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ReviewModerationControls({
  reviewId,
  status,
}: {
  reviewId: string;
  status: ReviewStatus;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function moderate(action: "APPROVE" | "REJECT" | "HIDE" | "RESTORE") {
    setPending(action);
    const result = await moderateReviewAction({ reviewId, action, note });
    setPending(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Rating ${action.toLowerCase()}d`);
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div>
        <h2 className="font-semibold">Moderation controls</h2>
        <p className="text-sm text-muted-foreground">
          Approve unchanged, reject with a reason, or remove published content from view.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="moderation-note">Admin note</Label>
        <Textarea
          id="moderation-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Required for rejection; optional for other actions"
          rows={4}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "PENDING_ADMIN" || status === "REJECTED" ? (
          <Button disabled={Boolean(pending)} onClick={() => void moderate("APPROVE")}>
            {pending === "APPROVE" ? "Approving..." : "Approve"}
          </Button>
        ) : null}
        {status === "PENDING_ADMIN" ? (
          <Button
            variant="destructive"
            disabled={Boolean(pending) || !note.trim()}
            onClick={() => void moderate("REJECT")}
          >
            {pending === "REJECT" ? "Rejecting..." : "Reject"}
          </Button>
        ) : null}
        {status === "APPROVED" ? (
          <Button
            variant="destructive"
            disabled={Boolean(pending)}
            onClick={() => void moderate("HIDE")}
          >
            {pending === "HIDE" ? "Hiding..." : "Hide from public view"}
          </Button>
        ) : null}
        {status === "HIDDEN" ? (
          <Button disabled={Boolean(pending)} onClick={() => void moderate("RESTORE")}>
            {pending === "RESTORE" ? "Restoring..." : "Restore"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
