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
      <div className="border rounded-lg">
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
