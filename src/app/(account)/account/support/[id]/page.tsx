import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyCaseReply } from "@/components/support/safety-case-reply";
import { requireUserPage } from "@/lib/auth-helpers";
import { getUserSafetyCase } from "@/lib/services/safety-case.service";

export default async function SafetyCasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;
  const item = await getUserSafetyCase(id, user.id);
  if (!item) notFound();
  const closed = item.status === "RESOLVED" || item.status === "REJECTED";
  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/account/support"><ArrowLeft className="mr-1 h-4 w-4" /> Support cases</Link>
      </Button>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{item.type}</Badge>
            <Badge>{item.status.replaceAll("_", " ")}</Badge>
            <span className="text-sm text-muted-foreground">{item.reference}</span>
          </div>
          <CardTitle>{item.subject}</CardTitle>
          <p className="text-sm text-muted-foreground">{item.category}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="whitespace-pre-wrap text-sm">{item.description}</p>
          {item.evidence.length ? (
            <div>
              <h2 className="mb-2 font-semibold">Evidence</h2>
              <div className="flex flex-wrap gap-2">
                {item.evidence.map((file) => (
                  <Button key={file.id} asChild variant="outline" size="sm">
                    <a href={file.url} target="_blank" rel="noreferrer">
                      <FileText className="mr-1 h-4 w-4" />{file.fileName}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <h2 className="mb-3 font-semibold">Updates</h2>
            <div className="space-y-3">
              {item.updates.map((update) => (
                <div key={update.id} className="rounded-xl border p-3 text-sm">
                  <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{update.author?.role === "ADMIN" ? "Linger Homes Support" : "You"}</span>
                    <span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(update.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{update.body}</p>
                </div>
              ))}
              {!item.updates.length ? <p className="text-sm text-muted-foreground">No updates yet.</p> : null}
            </div>
          </div>
          {item.resolution ? (
            <div className="rounded-xl bg-muted p-4">
              <h2 className="font-semibold">Resolution</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{item.resolution}</p>
            </div>
          ) : null}
          {!closed ? <SafetyCaseReply caseId={item.id} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
