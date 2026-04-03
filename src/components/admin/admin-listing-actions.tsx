"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { approveListing, rejectListing, suspendListing } from "@/lib/actions/admin.actions";
import { toast } from "sonner";
import { Check, X, Ban } from "lucide-react";

interface AdminListingActionsProps {
  listingId: string;
  currentStatus: string;
}

export function AdminListingActions({ listingId, currentStatus }: AdminListingActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const canApprove = currentStatus === "PENDING_REVIEW";
  const canReject = currentStatus === "PENDING_REVIEW";
  const canSuspend = currentStatus === "APPROVED";

  if (!canApprove && !canReject && !canSuspend) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No actions available for this status.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Moderation Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(canReject || canSuspend) && (
          <Textarea
            placeholder="Reason (required for reject/suspend)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        )}

        <div className="flex flex-col gap-2">
          {canApprove && (
            <Button
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await approveListing(listingId);
                  if (result?.error) toast.error(result.error);
                  else { toast.success("Listing approved"); router.refresh(); }
                });
              }}
            >
              <Check className="h-4 w-4 mr-2" />
              Approve Listing
            </Button>
          )}

          {canReject && (
            <Button
              variant="destructive"
              disabled={isPending || !reason.trim()}
              onClick={() => {
                startTransition(async () => {
                  const result = await rejectListing(listingId, reason);
                  if (result?.error) toast.error(result.error);
                  else { toast.success("Listing rejected"); setReason(""); router.refresh(); }
                });
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Reject Listing
            </Button>
          )}

          {canSuspend && (
            <Button
              variant="destructive"
              disabled={isPending || !reason.trim()}
              onClick={() => {
                startTransition(async () => {
                  const result = await suspendListing(listingId, reason);
                  if (result?.error) toast.error(result.error);
                  else { toast.success("Listing suspended"); setReason(""); router.refresh(); }
                });
              }}
            >
              <Ban className="h-4 w-4 mr-2" />
              Suspend Listing
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
