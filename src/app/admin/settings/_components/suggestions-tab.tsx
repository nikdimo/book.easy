import { SuggestionReviewCard } from "@/components/admin/suggestion-review-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils/format";
import type { getSuggestionsForAdmin } from "@/lib/services/admin.service";

type Suggestions = Awaited<ReturnType<typeof getSuggestionsForAdmin>>;

interface SuggestionsTabProps {
  pending: Suggestions["pending"];
  reviewed: Suggestions["reviewed"];
}

export function SuggestionsTab({ pending, reviewed }: SuggestionsTabProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Hosts can flag a property type or amenity they couldn&apos;t find in the picker.
        Review each one, edit the label if needed, and decide whether it should apply
        only to the listing that requested it or become a standard option for everyone.
      </p>

      {pending.length === 0 ? (
        <EmptyState
          title="No pending suggestions"
          description="You're all caught up."
        />
      ) : (
        <div className="space-y-4 mb-10">
          {pending.map((suggestion) => (
            <SuggestionReviewCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">History</h2>
          <div className="space-y-3 md:hidden">
            {reviewed.map((s) => (
              <article key={s.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{s.label}</h3>
                    <p className="text-sm text-muted-foreground">{s.kind === "PROPERTY_TYPE" ? "Property type" : "Amenity"}</p>
                  </div>
                  <Badge variant={s.status === "APPROVED" ? "default" : "secondary"}>{s.status}</Badge>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div><dt className="text-muted-foreground">Host</dt><dd>{s.host.name}</dd></div>
                  <div><dt className="text-muted-foreground">Scope</dt><dd>{s.scope === "GLOBAL" ? "All listings" : s.scope === "LISTING_ONLY" ? "This listing" : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Reviewed</dt><dd>{s.reviewedAt ? formatDate(s.reviewedAt) : "—"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden border rounded-lg md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewed.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.kind === "PROPERTY_TYPE" ? "Property type" : "Amenity"}</TableCell>
                    <TableCell className="font-medium">{s.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.host.name}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "APPROVED" ? "default" : "secondary"}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.scope === "GLOBAL" ? "All listings" : s.scope === "LISTING_ONLY" ? "This listing" : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.reviewedAt ? formatDate(s.reviewedAt) : "—"}
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
