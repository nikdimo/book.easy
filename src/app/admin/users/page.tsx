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
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {showingHosts ? "Hosts" : "User Management"}
        </h1>
        {showingHosts && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/users">Show all users</Link>
          </Button>
        )}
      </div>
      <div className="border rounded-lg">
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
