"use client";

import { useState } from "react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ListingActions({ title, listingId }: { title: string; listingId: string }) {
  const [saved, setSaved] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      } catch {
        toast.error("Could not share");
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
        toast.success("Report submitted, thank you");
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
        Share
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={() => setSaved((s) => !s)}
      >
        <Heart className={cn("h-4 w-4", saved && "fill-rose-600 text-rose-600")} />
        Save
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
            Report
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this listing</DialogTitle>
            <DialogDescription>
              Let us know what&apos;s wrong. Adding details is optional but helps us review it faster.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="What's wrong with this listing? (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button disabled={submitting} onClick={() => void submitReport()}>
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
