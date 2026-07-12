import Link from "next/link";
import { getReportsForAdmin } from "@/lib/services/admin.service";
import { ReportReviewCard } from "@/components/admin/report-review-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils/format";
import { Flag } from "lucide-react";

export const metadata = { title: "Admin - Reports" };

export default async function AdminReportsPage() {
  const { pending, reviewed } = await getReportsForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Listing reports</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Visitors can flag a listing directly from its page. Review each report and either
        dismiss it or remove the listing from the site.
      </p>

      {pending.length === 0 ? (
        <EmptyState icon={Flag} title="No pending reports" description="You're all caught up." />
      ) : (
        <div className="space-y-4 mb-10">
          {pending.map((report) => (
            <ReportReviewCard key={report.id} report={report} />
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">History</h2>
          <div className="space-y-3 md:hidden">
            {reviewed.map((r) => (
              <article key={r.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 font-semibold">
                      <Link href={`/admin/listings/${r.listing.id}`} className="underline underline-offset-2">
                        {r.listing.title}
                      </Link>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {r.reporter ? r.reporter.name : "Anonymous"}
                    </p>
                  </div>
                  <Badge variant={r.status === "REVIEWED" ? "destructive" : "secondary"}>{r.status}</Badge>
                </div>
                {r.message && <p className="mt-2 text-sm text-muted-foreground">&ldquo;{r.message}&rdquo;</p>}
                <dl className="mt-4 space-y-2 text-sm">
                  <div><dt className="text-muted-foreground">Reviewed by</dt><dd>{r.reviewedBy?.name ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Reviewed</dt><dd>{r.reviewedAt ? formatDate(r.reviewedAt) : "—"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden border rounded-lg md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed by</TableHead>
                  <TableHead>Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewed.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      <Link href={`/admin/listings/${r.listing.id}`} className="underline underline-offset-2">
                        {r.listing.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.reporter ? r.reporter.name : "Anonymous"}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                      {r.message ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "REVIEWED" ? "destructive" : "secondary"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reviewedBy?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.reviewedAt ? formatDate(r.reviewedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
