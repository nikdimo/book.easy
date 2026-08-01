"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { confirmAccountDeletionAction } from "@/lib/actions/account-deletion.actions";

const linkClass =
  "underline underline-offset-4 hover:text-foreground disabled:no-underline disabled:opacity-60";

export function ConfirmDeletion({ token, email }: { token: string; email: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await confirmAccountDeletionAction(token);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setDone(true);
      // The session row is deleted server-side; a full reload drops the now-dangling
      // cookie rather than letting the client router keep rendering stale account UI.
      setTimeout(() => {
        window.location.href = "/";
      }, 2500);
    });
  };

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account and personal data have been deleted. Taking you back to the homepage…
      </p>
    );
  }

  return (
    <div className="space-y-6 text-sm">
      <p className="text-muted-foreground">
        This permanently deletes the account for <strong className="text-foreground">{email}</strong>.
        Pending bookings will be cancelled and your listings archived. Booking records are kept
        anonymously for 7 years to meet tax and legal obligations. This cannot be undone.
      </p>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className={`${linkClass} text-destructive`}
        >
          {isPending ? "Deleting…" : "Yes, delete my account"}
        </button>
        <Link href="/account/privacy" className={linkClass}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
