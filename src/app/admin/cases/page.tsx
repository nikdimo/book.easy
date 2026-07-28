import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { requireAdminPage } from "@/lib/auth-helpers";
import { listAdminSafetyCases } from "@/lib/services/safety-case.service";

export const metadata = { title: "Reports and Claims" };

export default async function AdminCasesPage() {
  await requireAdminPage();
  const cases = await listAdminSafetyCases();
  return (
    <div>
      <h1 className="text-2xl font-bold">Reports and claims</h1>
      <p className="mb-6 mt-1 text-muted-foreground">Review incidents, evidence, replies, and resolutions.</p>
      {!cases.length ? (
        <EmptyState title="No cases" description="New user reports and booking claims appear here." />
      ) : (
        <div className="space-y-3">
          {cases.map((item) => (
            <Link key={item.id} href={`/admin/cases/${item.id}`}>
              <Card className="mb-3 hover:border-primary/40">
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{item.type}</Badge>
                      <Badge variant={item.priority === "URGENT" ? "destructive" : "outline"}>{item.priority}</Badge>
                      <Badge>{item.status.replaceAll("_", " ")}</Badge>
                    </div>
                    <p className="mt-2 font-semibold">{item.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.reference} · {item.reporter.name || item.reporter.email}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{item._count.evidence} files · {item._count.updates} updates</p>
                    <p>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(item.createdAt)}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
