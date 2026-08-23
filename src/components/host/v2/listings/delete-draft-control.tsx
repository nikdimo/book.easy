"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/host/v2/listings/confirm-dialog";
import { deleteListingDraft } from "@/lib/actions/listing.actions";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * Deleting a draft is one visible click rather than a menu.
 *
 * A draft has exactly two things a host can do with it — carry on, or throw it away —
 * and carrying on is already the row itself. Hiding the only other action behind a `…`
 * would double the work for the one case that actually happens in bulk: a wizard opened
 * and abandoned several times over, leaving a column of identical untitled drafts that
 * the host wants gone in a few seconds.
 */
export function DeleteDraftControl({
  draftId,
  title,
  className,
}: {
  draftId: string;
  title: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const { resolve } = useI18n();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteListingDraft(draftId);
      if (result && "error" in result) toast.error(result.error);
      else {
        setConfirming(false);
        toast.success(resolve("host.v2.listings.draft_deleted", "Draft deleted").text);
        router.refresh();
      }
    });
  }

  const label = interpolate(
    resolve("host.v2.listings.delete_draft", "Delete draft {title}"),
    { title }
  ).text;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={isPending}
        onClick={(event) => {
          // The row is a link to the wizard; without this, deleting would also navigate.
          event.stopPropagation();
          event.preventDefault();
          setConfirming(true);
        }}
        className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] disabled:opacity-50 ${className ?? ""}`}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        pending={isPending}
        destructive
        onConfirm={handleDelete}
        title={
          interpolate(resolve("host.v2.listings.delete_draft_title", "Delete {title}?"), {
            title,
          }).text
        }
        description={
          resolve(
            "host.v2.listings.delete_draft_body",
            "This unfinished listing and everything filled in so far will be gone for good. Nothing that is already on the site is affected."
          ).text
        }
        confirmLabel={resolve("host.v2.listings.delete_draft_action", "Delete draft").text}
      />
    </>
  );
}
