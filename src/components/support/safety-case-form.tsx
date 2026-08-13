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
import type { ClaimKind } from "@prisma/client";
import { Tx, useI18n } from "@/lib/i18n/client";

function categoryLabel(resolve: ReturnType<typeof useI18n>["resolve"], category: string) {
  switch (category) {
    case "Safety concern": return resolve("support.category.safety", "Safety concern").text;
    case "Harassment or abusive behavior": return resolve("support.category.harassment", "Harassment or abusive behavior").text;
    case "Fraud or scam": return resolve("support.category.fraud", "Fraud or scam").text;
    case "Discrimination": return resolve("support.category.discrimination", "Discrimination").text;
    case "Property information is misleading": return resolve("support.category.misleading", "Property information is misleading").text;
    case "Spam": return resolve("support.category.spam", "Spam").text;
    case "Property not as described": return resolve("support.category.not_described", "Property not as described").text;
    case "Host cancellation": return resolve("support.category.host_cancellation", "Host cancellation").text;
    case "Guest damage": return resolve("support.category.guest_damage", "Guest damage").text;
    case "Payment or refund": return resolve("support.category.payment_refund", "Payment or refund").text;
    case "Safety incident": return resolve("support.category.safety_incident", "Safety incident").text;
    case "Missing item": return resolve("support.category.missing_item", "Missing item").text;
    default: return resolve("support.category.other", "Other").text;
  }
}

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
  claimKind,
}: {
  type: "REPORT" | "CLAIM";
  targetType: "USER" | "HOST" | "LISTING" | "BOOKING" | "MESSAGE";
  listingId?: string;
  bookingId?: string;
  messageId?: string;
  reportedUserId?: string;
  claimKind?: ClaimKind;
}) {
  const { resolve } = useI18n();
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
      if (!response.ok) throw new Error(resolve("support.upload_failed", "Upload failed").text);
      setEvidence((current) => [...current, result]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : resolve("support.upload_failed", "Upload failed").text);
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
    if (type === "CLAIM") {
      formData.set("claimKind", String(formData.get("claimKind") || claimKind || ""));
    }
    const result = await submitSafetyCaseAction(formData);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(type === "CLAIM"
      ? resolve("support.claim_submitted", "Claim submitted").text
      : resolve("support.report_submitted", "Report submitted").text);
    router.push(`/account/support/${result.caseId}`);
  }

  return (
    <form action={(data) => void submit(data)} className="space-y-5">
      {type === "CLAIM" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="claimKind"><Tx k="support.request_type" source="Request type" /></Label>
            <select
              id="claimKind"
              name="claimKind"
              required
              defaultValue={claimKind || ""}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="" disabled>{resolve("support.choose_request_type", "Choose a request type").text}</option>
              <option value="EXPENSE">{resolve("support.claim.expense", "Extra expense").text}</option>
              <option value="DAMAGE">{resolve("support.claim.damage", "Property damage or missing item").text}</option>
              <option value="REFUND">{resolve("support.claim.refund", "Guest refund request").text}</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-2">
              <Label htmlFor="requestedAmount"><Tx k="support.requested_amount" source="Requested amount" /></Label>
              <Input
                id="requestedAmount"
                name="requestedAmount"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="100000"
                step="0.01"
                required
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency"><Tx k="support.currency" source="Currency" /></Label>
              <select
                id="currency"
                name="currency"
                defaultValue="EUR"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                <option value="EUR" translate="no">EUR</option>
                <option value="MKD" translate="no">MKD</option>
                <option value="DKK" translate="no">DKK</option>
                <option value="USD" translate="no">USD</option>
              </select>
            </div>
          </div>
        </>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="category"><Tx k="support.category" source="Category" /></Label>
        <select
          id="category"
          name="category"
          required
          defaultValue=""
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          <option value="" disabled>{resolve("support.choose_category", "Choose a category").text}</option>
          {categories.map((category) => (
            <option key={category} value={category}>{categoryLabel(resolve, category)}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject"><Tx k="support.short_summary" source="Short summary" /></Label>
        <Input id="subject" name="subject" minLength={5} maxLength={120} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description"><Tx k="support.what_happened" source="What happened?" /></Label>
        <Textarea
          id="description"
          name="description"
          minLength={20}
          maxLength={5000}
          rows={7}
          required
          placeholder={resolve("support.description_placeholder", "Include the important facts, dates, and what outcome you need.").text}
        />
      </div>
      <div className="space-y-2">
        <Label><Tx k="support.evidence_optional" source="Evidence (optional)" /></Label>
        <p className="text-xs text-muted-foreground">
          <Tx k="support.evidence_limits" source="Up to 5 JPG, PNG, WebP, or PDF files, 10 MB each." />
        </p>
        {evidence.map((item, index) => (
          <div key={`${item.url}-${index}`} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEvidence((current) => current.filter((_, i) => i !== index))}
              aria-label={resolve("support.remove_file", "Remove {fileName}").text.replace("{fileName}", item.fileName)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {evidence.length < 5 ? (
          <label className="inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
            <FileUp className="mr-2 h-4 w-4" />
            {uploading
              ? resolve("common.uploading", "Uploading...").text
              : resolve("support.add_evidence", "Add evidence").text}
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
        <Tx k="support.confirmation_notice" source="We send confirmation by email and in the app. Linger Homes administrators can review the related booking, listing, user, and reported message." />
      </div>
      <Button type="submit" disabled={pending || uploading}>
        {pending
          ? resolve("common.submitting", "Submitting...").text
          : type === "CLAIM"
            ? resolve("support.submit_claim_short", "Submit claim").text
            : resolve("support.submit_report_short", "Submit report").text}
      </Button>
    </form>
  );
}
