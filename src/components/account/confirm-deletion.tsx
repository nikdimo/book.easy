"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmAccountDeletionAction } from "@/lib/actions/account-deletion.actions";
import { Tx, useI18n } from "@/lib/i18n/client";

const linkClass =
  "underline underline-offset-4 hover:text-foreground disabled:no-underline disabled:opacity-60";

export function ConfirmDeletion({ token, email }: { token: string; email: string }) {
  const { resolve } = useI18n();
  const router = useRouter();
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
      // The server action clears the JWT session cookie. Replace the account page so
      // Back cannot reopen it from browser history.
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 2500);
    });
  };

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        <Tx k="account.deletion.done" source="Your account and personal data have been deleted. Taking you back to the homepage…" />
      </p>
    );
  }

  return (
    <div className="space-y-6 text-sm">
      <p className="text-muted-foreground">
        {resolve("account.deletion.warning", "This permanently deletes the account for {email}. Pending bookings will be cancelled and your listings archived. Booking records are kept anonymously for 7 years to meet tax and legal obligations. This cannot be undone.").text.replace("{email}", email)}
      </p>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className={`${linkClass} text-destructive`}
        >
          {isPending
            ? resolve("account.deletion.deleting", "Deleting…").text
            : resolve("account.deletion.confirm", "Yes, delete my account").text}
        </button>
        <Link href="/account/privacy" className={linkClass}>
          <Tx k="common.cancel" source="Cancel" />
        </Link>
      </div>
    </div>
  );
}
