import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { requireUserPage } from "@/lib/auth-helpers";
import { listUserSafetyCases } from "@/lib/services/safety-case.service";
import { getT, T, t } from "@/lib/i18n/t";
import { resolveClaimResponse, resolveSafetyCaseStatus, resolveSafetyCaseType } from "@/lib/i18n/support-labels";

export const metadata = { title: "Support Cases" };

export default async function SupportCasesPage() {
  const translator = await getT();
  const user = await requireUserPage("/account/support");
  const cases = await listUserSafetyCases(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold"><T t={translator} k="support.cases" source="Support cases" /></h1>
          <p className="mt-1 text-muted-foreground"><T t={translator} k="support.subheading" source="Track reports, claims, and support replies." /></p>
        </div>
        <Button asChild variant="outline"><Link href="/properties"><T t={translator} k="support.report_listing" source="Report a listing" /></Link></Button>
      </div>
      {!cases.length ? (
        <EmptyState title={t(translator, "support.empty", "No support cases")} description={t(translator, "support.empty_description", "Claims and reports you submit will appear here.")} />
      ) : (
        <div className="space-y-3">
          {cases.map((item) => (
            <Link href={`/account/support/${item.id}`} key={item.id}>
              <Card className="mb-3 hover:border-primary/40">
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{resolveSafetyCaseType(translator, item.type).text}</Badge>
                      {item.type === "CLAIM" ? (
                        <Badge variant="outline">
                          {item.reporterId === user.id ? t(translator, "support.sent", "Sent") : t(translator, "support.received", "Received")}
                        </Badge>
                      ) : null}
                      <Badge variant={item.status === "RESOLVED" ? "default" : "outline"}>
                        {resolveSafetyCaseStatus(translator, item.status).text}
                      </Badge>
                    </div>
                    <p className="mt-2 font-semibold" data-user-generated-content translate="yes">{item.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.reference}{item.listing ? ` · ${item.listing.title}` : ""}
                    </p>
                    {item.type === "CLAIM" && item.requestedAmount ? (
                      <p className="mt-1 text-sm font-medium">
                        {Number(item.requestedAmount).toFixed(2)} {item.currency || "EUR"} ·{" "}
                        {resolveClaimResponse(translator, item.responseStatus).text}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(translator.locale, { dateStyle: "medium" }).format(item.createdAt)}
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
