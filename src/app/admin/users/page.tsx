import Link from "next/link";
import { getAllUsersForAdmin } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { formatDate } from "@/lib/utils/format";
import { ListControls } from "@/components/shared/list-controls";

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
      <ListControls
        searchPlaceholder="Search users by name, email, role or account details…"
        filters={[
          { key: "role", label: "Role", options: [{ value: "ADMIN", label: "Admin" }, { value: "USER", label: "User" }] },
          { key: "host", label: "Account type", allLabel: "All account types", options: [{ value: "yes", label: "Hosts" }, { value: "no", label: "Guests" }] },
          { key: "active", label: "Activity", allLabel: "All activity", options: [{ value: "yes", label: "Active" }, { value: "no", label: "Inactive" }] },
        ]}
        sorts={[
          { value: "created", label: "Newest users", direction: "desc" },
          { value: "oldest", label: "Oldest users" },
          { value: "name", label: "Name: A–Z" },
          { value: "listings", label: "Most listings", direction: "desc" },
          { value: "bookings", label: "Most bookings", direction: "desc" },
        ]}
        items={filteredUsers.map((user) => ({
          id: user.id,
          searchText: [user.name, user.email, user.role, user.isHost ? "host" : "guest", user.isActive ? "active" : "inactive", user._count.listings, user._count.bookings, formatDate(user.createdAt)].join(" "),
          filters: { role: user.role, host: user.isHost ? "yes" : "no", active: user.isActive ? "yes" : "no" },
          sortValues: { created: user.createdAt.getTime(), oldest: user.createdAt.getTime(), name: user.name, listings: user._count.listings, bookings: user._count.bookings },
          content: (
          <article className="rounded-xl border bg-card p-4 shadow-sm">
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
          ),
          row: (
              <TableRow>
                <TableCell className="font-medium" data-label="Name">{user.name}</TableCell>
                <TableCell className="text-sm" data-label="Email">{user.email}</TableCell>
                <TableCell data-label="Role">
                  <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                </TableCell>
                <TableCell data-label="Host">{user.isHost ? "Yes" : "No"}</TableCell>
                <TableCell data-label="Active">
                  <Badge variant={user.isActive ? "default" : "destructive"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell data-label="Listings">{user._count.listings}</TableCell>
                <TableCell data-label="Bookings">{user._count.bookings}</TableCell>
                <TableCell className="text-sm text-muted-foreground" data-label="Joined">{formatDate(user.createdAt)}</TableCell>
                <TableCell>
                  {user.role !== "ADMIN" && (
                    <AdminUserActions userId={user.id} isActive={user.isActive} />
                  )}
                </TableCell>
              </TableRow>
          ),
        }))}
        tableHead={
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
        }
      />
    </div>
  );
}
