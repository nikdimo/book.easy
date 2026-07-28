import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { SafetyCaseControls } from "@/components/admin/safety-case-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/services/audit.service";
import { getAdminSafetyCase } from "@/lib/services/safety-case.service";

export default async function AdminCasePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const item = await getAdminSafetyCase(id);
  if (!item) notFound();
  await createAuditLog({ userId: admin.id, action: "safety_case.view", entityType: "SafetyCase", entityId: id });
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/cases"><ArrowLeft className="mr-1 h-4 w-4" /> Reports and claims</Link>
      </Button>
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge>{item.type}</Badge><Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge>
          <Badge variant={item.priority === "URGENT" ? "destructive" : "secondary"}>{item.priority}</Badge>
        </div>
        <h1 className="mt-2 text-2xl font-bold">{item.subject}</h1>
        <p className="text-muted-foreground">{item.reference} · {item.category}</p>
      </div>
      <div className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2">
        <div><span className="text-muted-foreground">Reporter</span><p>{item.reporter.name} · {item.reporter.email}</p></div>
        <div><span className="text-muted-foreground">Reported user</span><p>{item.reportedUser ? `${item.reportedUser.name} · ${item.reportedUser.email}` : "None"}</p></div>
        <div><span className="text-muted-foreground">Listing</span><p>{item.listing?.title || "None"}</p></div>
        <div><span className="text-muted-foreground">Assigned</span><p>{item.assignedAdmin?.name || "Unassigned"}</p></div>
      </div>
      <div className="rounded-xl border p-4">
        <h2 className="mb-2 font-semibold">Description</h2>
        <p className="whitespace-pre-wrap text-sm">{item.description}</p>
        {item.message ? <div className="mt-4 rounded-lg bg-muted p-3 text-sm"><b>Reported message:</b> {item.message.body}</div> : null}
      </div>
      {item.evidence.length ? (
        <div className="rounded-xl border p-4">
          <h2 className="mb-2 font-semibold">Evidence</h2>
          <div className="flex flex-wrap gap-2">{item.evidence.map((file) => (
            <Button key={file.id} variant="outline" size="sm" asChild>
              <a href={file.url} target="_blank" rel="noreferrer"><FileText className="mr-1 h-4 w-4" />{file.fileName}</a>
            </Button>
          ))}</div>
        </div>
      ) : null}
      <div className="rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">Timeline</h2>
        <div className="space-y-3">
          {item.updates.map((update) => (
            <div key={update.id} className="rounded-lg bg-muted/60 p-3 text-sm">
              <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{update.author?.name || "Deleted user"} {update.isInternal ? "· INTERNAL" : ""}</span>
                <span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(update.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{update.body}</p>
            </div>
          ))}
          {!item.updates.length ? <p className="text-sm text-muted-foreground">No updates yet.</p> : null}
        </div>
      </div>
      {item.conversation ? (
        <Button asChild variant="outline"><Link href={`/admin/communications/${item.conversation.id}`}>View related conversation</Link></Button>
      ) : null}
      <SafetyCaseControls caseId={item.id} initialStatus={item.status} initialPriority={item.priority} />
    </div>
  );
}
