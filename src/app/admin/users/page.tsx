import Link from "next/link";
import { getAllUsersForAdmin } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Admin - Users" };

interface AdminUsersPageProps {
  searchParams?: Promise<{ type?: string }>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const { type } = (await searchParams) ?? {};
  const users = await getAllUsersForAdmin();
  const showingHosts = type === "hosts";
  const filteredUsers = showingHosts
    ? users.filter((user) => user.isHost)
    : users;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {showingHosts ? "Hosts" : "User Management"}
        </h1>
        {showingHosts && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/users">Show all users</Link>
          </Button>
        )}
      </div>
      <div className="space-y-3 md:hidden">
        {filteredUsers.map((user) => (
          <article key={user.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{user.name}</h2>
                <p className="break-all text-sm text-muted-foreground">{user.email}</p>
              </div>
              <Badge variant={user.isActive ? "default" : "destructive"}>
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-muted-foreground">Role</dt><dd>{user.role}</dd></div>
              <div><dt className="text-muted-foreground">Host</dt><dd>{user.isHost ? "Yes" : "No"}</dd></div>
              <div><dt className="text-muted-foreground">Listings</dt><dd>{user._count.listings}</dd></div>
              <div><dt className="text-muted-foreground">Bookings</dt><dd>{user._count.bookings}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Joined</dt><dd>{formatDate(user.createdAt)}</dd></div>
            </dl>
            {user.role !== "ADMIN" && (
              <div className="mt-4 border-t pt-3"><AdminUserActions userId={user.id} isActive={user.isActive} /></div>
            )}
          </article>
        ))}
      </div>
      <div className="hidden border rounded-lg md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Listings</TableHead>
              <TableHead>Bookings</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-sm">{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                </TableCell>
                <TableCell>{user.isHost ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "default" : "destructive"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>{user._count.listings}</TableCell>
                <TableCell>{user._count.bookings}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                <TableCell>
                  {user.role !== "ADMIN" && (
                    <AdminUserActions userId={user.id} isActive={user.isActive} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
