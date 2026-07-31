import Link from "next/link";
import {
  MarketingAudience,
  MarketingPreferenceStatus,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdminPage } from "@/lib/auth-helpers";
import { getMarketingAdminOverview } from "@/lib/services/marketing-consent.service";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Admin - Marketing consent" };

export default async function MarketingAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; audience?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const status = Object.values(MarketingPreferenceStatus).includes(
    params.status as MarketingPreferenceStatus
  )
    ? (params.status as MarketingPreferenceStatus)
    : undefined;
  const audience = Object.values(MarketingAudience).includes(
    params.audience as MarketingAudience
  )
    ? (params.audience as MarketingAudience)
    : undefined;
  const overview = await getMarketingAdminOverview({ status, audience });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketing consent</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Audit view of affirmative consent and suppression. Cookie preferences are intentionally
          not included because they do not authorize direct marketing.
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          ["Subscribed preferences", overview.counts.subscribed],
          ["Pending confirmation", overview.counts.pending],
          ["Suppressed contacts", overview.counts.suppressed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-3xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-md border px-3 py-2" href="/admin/marketing">All</Link>
        {Object.values(MarketingPreferenceStatus).map((item) => (
          <Link
            key={item}
            className="rounded-md border px-3 py-2"
            href={`/admin/marketing?status=${item}${audience ? `&audience=${audience}` : ""}`}
          >
            {item.replaceAll("_", " ")}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table className="table-stacked">
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Consent wording</TableHead>
              <TableHead>Latest evidence</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overview.preferences.map((preference) => (
              <TableRow key={preference.id}>
                <TableCell data-label="Email">{preference.contact.email}</TableCell>
                <TableCell data-label="Channel">{preference.channel}</TableCell>
                <TableCell data-label="Audience">{preference.audience}</TableCell>
                <TableCell data-label="Status"><Badge variant="secondary">{preference.status}</Badge></TableCell>
                <TableCell className="max-w-xs text-xs" data-label="Consent wording">
                  {preference.statement?.version || "—"}
                </TableCell>
                <TableCell className="text-xs" data-label="Latest evidence">
                  {preference.events[0]
                    ? `${preference.events[0].action} · ${preference.events[0].source}`
                    : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground" data-label="Updated">
                  {formatDate(preference.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
            {!overview.preferences.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No consent records match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
