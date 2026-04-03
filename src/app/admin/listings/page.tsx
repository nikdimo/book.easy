import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LISTING_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Admin - Listings" };

export default async function AdminListingsPage() {
  const listings = await db.listing.findMany({
    include: {
      property: { select: { city: true } },
      host: { select: { name: true, email: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: [
      { status: "asc" },
      { updatedAt: "desc" },
    ],
  });

  const pending = listings.filter((l) => l.status === "PENDING_REVIEW");
  const rest = listings.filter((l) => l.status !== "PENDING_REVIEW");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Listings Management</h1>

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            Pending Review
            <Badge variant="secondary">{pending.length}</Badge>
          </h2>
          <ListingsTable listings={pending} />
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">All Listings</h2>
      <ListingsTable listings={rest} />
    </div>
  );
}

function ListingsTable({ listings }: { listings: typeof Array.prototype & { id: string; title: string; status: string; property: { city: string }; host: { name: string; email: string }; createdAt: Date; _count: { bookings: number } }[] }) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Bookings</TableHead>
            <TableHead>Created</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing: { id: string; title: string; status: string; property: { city: string }; host: { name: string; email: string }; createdAt: Date; _count: { bookings: number } }) => {
            const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);
            return (
              <TableRow key={listing.id}>
                <TableCell className="font-medium max-w-[200px] truncate">{listing.title}</TableCell>
                <TableCell>
                  <div className="text-sm">{listing.host.name}</div>
                  <div className="text-xs text-muted-foreground">{listing.host.email}</div>
                </TableCell>
                <TableCell>{listing.property.city}</TableCell>
                <TableCell>
                  <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
                    {statusConfig?.label || listing.status}
                  </Badge>
                </TableCell>
                <TableCell>{listing._count.bookings}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(listing.createdAt)}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/listings/${listing.id}`}>Review</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
