import Link from "next/link";
import { getAllListingsForAdmin } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LISTING_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Admin - Listings" };

interface AdminListingsPageProps {
  searchParams?: Promise<{ status?: string }>;
}

export default async function AdminListingsPage({
  searchParams,
}: AdminListingsPageProps) {
  const { status } = (await searchParams) ?? {};
  const listings = await getAllListingsForAdmin();

  const validStatus = LISTING_STATUSES.some((s) => s.value === status)
    ? status
    : null;
  const filteredListings = validStatus
    ? listings.filter((l) => l.status === validStatus)
    : listings;
  const pending = listings.filter((l) => l.status === "PENDING_REVIEW");
  const rest = filteredListings.filter((l) => l.status !== "PENDING_REVIEW");
  const activeLabel = validStatus
    ? LISTING_STATUSES.find((s) => s.value === validStatus)?.label
    : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {activeLabel ? `${activeLabel} Listings` : "Listings Management"}
        </h1>
        {validStatus && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/listings">Show all listings</Link>
          </Button>
        )}
      </div>

      {!validStatus && pending.length > 0 && (
        <div className="mb-8">
          <h2
            id="pending-review"
            className="text-lg font-semibold mb-3 flex items-center gap-2 scroll-mt-8"
          >
            Pending Review
            <Badge variant="secondary">{pending.length}</Badge>
          </h2>
          <ListingsTable listings={pending} />
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">
        {activeLabel ? activeLabel : "All Listings"}
      </h2>
      <ListingsTable listings={validStatus === "PENDING_REVIEW" ? filteredListings : rest} />
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
