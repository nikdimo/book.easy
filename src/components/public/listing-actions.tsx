"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share, Heart, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { reportListing } from "@/lib/actions/report.actions";
import { toggleFavorite } from "@/lib/actions/favorite.actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";

export function ListingActions({
  title,
  listingId,
  initialSaved = false,
  isAuthenticated,
}: {
  title: string;
  listingId: string;
  initialSaved?: boolean;
  isAuthenticated: boolean;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [, startTransition] = useTransition();
  const [reportOpen, setReportOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleToggleSaved() {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleFavorite(listingId);
      if (result?.error) {
        setSaved(!next);
        toast.error(result.error);
      }
    });
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(i18n.resolve("listing.link_copied_clipboard", "Link copied to clipboard").text);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(i18n.resolve("listing.link_copied", "Link copied").text);
      } catch {
        toast.error(i18n.resolve("listing.share_failed", "Could not share").text);
      }
    }
  }

  async function submitReport() {
    setSubmitting(true);
    try {
      const result = await reportListing(listingId, message);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(i18n.resolve("listing.report_submitted", "Report submitted, thank you").text);
        setMessage("");
        setReportOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={() => void share()}
      >
        <Share className="h-4 w-4" />
        <Tx k="listing.share" source="Share" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={handleToggleSaved}
      >
        <Heart className={cn("h-4 w-4", saved && "fill-rose-600 text-rose-600")} />
        <Tx k="listing.save" source="Save" />
      </Button>
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
          >
            <Flag className="h-4 w-4" />
            <Tx k="listing.report" source="Report" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><Tx k="listing.report_title" source="Report this listing" /></DialogTitle>
            <DialogDescription>
              <Tx k="listing.report_description" source="Let us know what's wrong. Adding details is optional but helps us review it faster." />
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={i18n.resolve("listing.report_placeholder", "What's wrong with this listing? (optional)").text}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button disabled={submitting} onClick={() => void submitReport()}>
              <Tx k="listing.submit_report" source="Submit report" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
