"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, X } from "lucide-react";
import { toast } from "sonner";
import { submitSafetyCaseAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const reportCategories = [
  "Safety concern",
  "Harassment or abusive behavior",
  "Fraud or scam",
  "Discrimination",
  "Property information is misleading",
  "Spam",
  "Other",
];
const claimCategories = [
  "Property not as described",
  "Host cancellation",
  "Guest damage",
  "Payment or refund",
  "Safety incident",
  "Missing item",
  "Other",
];

interface Evidence {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function SafetyCaseForm({
  type,
  targetType,
  listingId,
  bookingId,
  messageId,
  reportedUserId,
}: {
  type: "REPORT" | "CLAIM";
  targetType: "USER" | "HOST" | "LISTING" | "BOOKING" | "MESSAGE";
  listingId?: string;
  bookingId?: string;
  messageId?: string;
  reportedUserId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const categories = type === "CLAIM" ? claimCategories : reportCategories;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || evidence.length >= 5) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const response = await fetch("/api/support/evidence", {
        method: "POST",
        body: data,
      });
      const result = (await response.json()) as Evidence & { error?: string };
      if (!response.ok) throw new Error(result.error || "Upload failed");
      setEvidence((current) => [...current, result]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit(formData: FormData) {
    setPending(true);
    formData.set("type", type);
    formData.set("targetType", targetType);
    formData.set("listingId", listingId || "");
    formData.set("bookingId", bookingId || "");
    formData.set("messageId", messageId || "");
    formData.set("reportedUserId", reportedUserId || "");
    formData.set("evidence", JSON.stringify(evidence));
    const result = await submitSafetyCaseAction(formData);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${type === "CLAIM" ? "Claim" : "Report"} submitted`);
    router.push(`/account/support/${result.caseId}`);
  }

  return (
    <form action={(data) => void submit(data)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          required
          defaultValue=""
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          <option value="" disabled>Choose a category</option>
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">Short summary</Label>
        <Input id="subject" name="subject" minLength={5} maxLength={120} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">What happened?</Label>
        <Textarea
          id="description"
          name="description"
          minLength={20}
          maxLength={5000}
          rows={7}
          required
          placeholder="Include the important facts, dates, and what outcome you need."
        />
      </div>
      <div className="space-y-2">
        <Label>Evidence (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Up to 5 JPG, PNG, WebP, or PDF files, 10 MB each.
        </p>
        {evidence.map((item, index) => (
          <div key={`${item.url}-${index}`} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEvidence((current) => current.filter((_, i) => i !== index))}
              aria-label={`Remove ${item.fileName}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {evidence.length < 5 ? (
          <label className="inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
            <FileUp className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : "Add evidence"}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              disabled={uploading}
              onChange={(event) => void upload(event)}
              className="sr-only"
            />
          </label>
        ) : null}
      </div>
      <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        We send confirmation by email and in the app. Linger Homes administrators can
        review the related booking, listing, user, and reported message.
      </div>
      <Button type="submit" disabled={pending || uploading}>
        {pending ? "Submitting..." : `Submit ${type === "CLAIM" ? "claim" : "report"}`}
      </Button>
    </form>
  );
}
