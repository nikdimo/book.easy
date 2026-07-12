import Link from "next/link";
import { getAllListingsForAdmin } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LISTING_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Admin - Listings" };

type AdminListing = Awaited<ReturnType<typeof getAllListingsForAdmin>>[number];

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
  const pending = listings.filter((l) => l.needsReview);
  const rest = validStatus ? filteredListings : filteredListings.filter((l) => !l.needsReview);
  const activeLabel = validStatus
    ? LISTING_STATUSES.find((s) => s.value === validStatus)?.label
    : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
            Needs Review
            <Badge variant="secondary">{pending.length}</Badge>
          </h2>
          <ListingsTable listings={pending} />
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">
        {activeLabel ? activeLabel : "All Listings"}
      </h2>
      <ListingsTable listings={rest} />
    </div>
  );
}

function ListingsTable({ listings }: { listings: AdminListing[] }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {listings.map((listing) => {
          const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);
          return (
            <article key={listing.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 font-semibold">{listing.title}</h3>
                  <p className="text-sm text-muted-foreground">{listing.property.city}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
                    {statusConfig?.label || listing.status}
                  </Badge>
                  {listing.needsReview && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                      Needs review
                    </Badge>
                  )}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><dt className="text-muted-foreground">Host</dt><dd>{listing.host.name}</dd><dd className="break-all text-xs text-muted-foreground">{listing.host.email}</dd></div>
                <div><dt className="text-muted-foreground">Bookings</dt><dd>{listing._count.bookings}</dd></div>
                <div><dt className="text-muted-foreground">Created</dt><dd>{formatDate(listing.createdAt)}</dd></div>
              </dl>
              <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                <Link href={`/admin/listings/${listing.id}`}>Review listing</Link>
              </Button>
            </article>
          );
        })}
      </div>
      <div className="hidden border rounded-lg md:block">
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
          {listings.map((listing) => {
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
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
                      {statusConfig?.label || listing.status}
                    </Badge>
                    {listing.needsReview && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        Needs review
                      </Badge>
                    )}
                  </div>
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
    </>
  );
}
