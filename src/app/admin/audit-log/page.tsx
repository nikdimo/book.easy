import { getAuditLogs } from "@/lib/services/admin.service";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export const metadata = { title: "Admin - Audit Log" };

export default async function AuditLogPage() {
  const logs = await getAuditLogs();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>
      <div className="space-y-3 md:hidden">
        {logs.map((log) => (
          <article key={log.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium">{log.user.name}</h2>
                <p className="break-all text-xs text-muted-foreground">{log.user.email}</p>
              </div>
              <Badge variant="secondary">{log.action}</Badge>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-muted-foreground">Timestamp</dt><dd>{format(log.createdAt, "yyyy-MM-dd HH:mm")}</dd></div>
              <div><dt className="text-muted-foreground">Entity</dt><dd>{log.entityType} <span className="text-xs text-muted-foreground">{log.entityId.slice(0, 8)}</span></dd></div>
              <div><dt className="text-muted-foreground">Details</dt><dd className="break-words text-xs">{log.metadata ? JSON.stringify(log.metadata) : "—"}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <div className="hidden border rounded-lg md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(log.createdAt, "yyyy-MM-dd HH:mm")}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{log.user.name}</div>
                  <div className="text-xs text-muted-foreground">{log.user.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{log.action}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {log.entityType} <span className="text-muted-foreground text-xs">{log.entityId.slice(0, 8)}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                  {log.metadata ? JSON.stringify(log.metadata) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
