import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUserPage } from "@/lib/auth-helpers";
import { listUserSafetyCases } from "@/lib/services/safety-case.service";

export const metadata = { title: "Support Cases" };

export default async function SupportCasesPage() {
  const user = await requireUserPage("/account/support");
  const cases = await listUserSafetyCases(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Support cases</h1>
          <p className="mt-1 text-muted-foreground">Track reports, claims, and support replies.</p>
        </div>
        <Button asChild variant="outline"><Link href="/properties">Report a listing</Link></Button>
      </div>
      {!cases.length ? (
        <EmptyState title="No support cases" description="Claims and reports you submit will appear here." />
      ) : (
        <div className="space-y-3">
          {cases.map((item) => (
            <Link href={`/account/support/${item.id}`} key={item.id}>
              <Card className="mb-3 hover:border-primary/40">
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{item.type}</Badge>
                      {item.type === "CLAIM" ? (
                        <Badge variant="outline">
                          {item.reporterId === user.id ? "SENT" : "RECEIVED"}
                        </Badge>
                      ) : null}
                      <Badge variant={item.status === "RESOLVED" ? "default" : "outline"}>
                        {item.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 font-semibold">{item.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.reference}{item.listing ? ` · ${item.listing.title}` : ""}
                    </p>
                    {item.type === "CLAIM" && item.requestedAmount ? (
                      <p className="mt-1 text-sm font-medium">
                        {Number(item.requestedAmount).toFixed(2)} {item.currency || "EUR"} ·{" "}
                        {item.responseStatus?.replaceAll("_", " ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(item.createdAt)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
