"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { reviewReport } from "@/lib/actions/report.actions";
import { formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { Ban, X } from "lucide-react";

interface ReportReviewCardProps {
  report: {
    id: string;
    message: string | null;
    createdAt: Date;
    reporter: { name: string; email: string } | null;
    listing: { id: string; title: string; slug: string; status: string };
  };
}

export function ReportReviewCard({ report }: ReportReviewCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function dismiss() {
    startTransition(async () => {
      const result = await reviewReport(report.id, "dismiss");
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Report dismissed");
        router.refresh();
      }
    });
  }

  function removeListing() {
    startTransition(async () => {
      const result = await reviewReport(report.id, "remove_listing", reason);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Listing removed");
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm">
              Reported listing:{" "}
              <Link
                href={`/admin/listings/${report.listing.id}`}
                className="underline underline-offset-2"
              >
                {report.listing.title}
              </Link>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.reporter ? `Reported by ${report.reporter.name} (${report.reporter.email})` : "Reported anonymously"}
              {" · "}
              {formatDate(report.createdAt)}
            </p>
            {report.message && (
              <p className="mt-1 text-sm text-muted-foreground">&ldquo;{report.message}&rdquo;</p>
            )}
          </div>
          <Badge variant={report.listing.status === "APPROVED" ? "default" : "secondary"}>
            {report.listing.status}
          </Badge>
        </div>

        <Textarea
          placeholder="Reason (required to remove the listing)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />

        <div className="flex gap-2">
          <Button
            variant="destructive"
            disabled={isPending || !reason.trim() || report.listing.status !== "APPROVED"}
            onClick={removeListing}
          >
            <Ban className="h-4 w-4 mr-2" />
            Remove Listing
          </Button>
          <Button variant="outline" disabled={isPending} onClick={dismiss}>
            <X className="h-4 w-4 mr-2" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
