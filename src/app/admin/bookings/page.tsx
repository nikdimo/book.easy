import Link from "next/link";
import { getAllBookingsForAdmin } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminCancelBookingButton } from "@/components/admin/admin-cancel-booking-button";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";
import { ListControls } from "@/components/shared/list-controls";

export const metadata = { title: "Admin - Bookings" };

interface AdminBookingsPageProps {
  searchParams?: Promise<{ status?: string }>;
}

export default async function AdminBookingsPage({
  searchParams,
}: AdminBookingsPageProps) {
  const { status } = (await searchParams) ?? {};
  const bookings = await getAllBookingsForAdmin();
  const validStatus = BOOKING_STATUSES.some((s) => s.value === status)
    ? status
    : null;
  const filteredBookings = validStatus
    ? bookings.filter((booking) => booking.status === validStatus)
    : bookings;
  const activeLabel = validStatus
    ? BOOKING_STATUSES.find((s) => s.value === validStatus)?.label
    : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {activeLabel ? `${activeLabel} Bookings` : "All Bookings"}
        </h1>
        {validStatus && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/bookings">Show all bookings</Link>
          </Button>
        )}
      </div>
      <ListControls
        searchPlaceholder="Search bookings by property, city, guest, email, reference or status…"
        filters={[{ key: "status", label: "Status", options: BOOKING_STATUSES.map((item) => ({ value: item.value, label: item.label })) }]}
        sorts={[
          { value: "checkIn", label: "Check-in: newest", direction: "desc" },
          { value: "oldest", label: "Check-in: oldest" },
          { value: "total", label: "Total: highest", direction: "desc" },
          { value: "guest", label: "Guest: A–Z" },
          { value: "listing", label: "Property: A–Z" },
        ]}
        items={filteredBookings.map((booking) => {
          const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
          const canCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";
          return { id: booking.id,
            searchText: [booking.listing.title, booking.listing.property.city, booking.guest.name, booking.guest.email, booking.reference, booking.status, statusConfig?.label, formatDate(booking.checkIn), formatDate(booking.checkOut)].filter(Boolean).join(" "),
            filters: { status: booking.status },
            sortValues: { checkIn: booking.checkIn.getTime(), oldest: booking.checkIn.getTime(), total: Number(booking.totalPrice), guest: booking.guest.name, listing: booking.listing.title },
            content: <>
      <div className="md:hidden">
            <article key={booking.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="line-clamp-2 font-semibold">{booking.listing.title}</h2>
                  <p className="text-sm text-muted-foreground">{booking.listing.property.city}</p>
                </div>
                <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                  {statusConfig?.label || booking.status}
                </Badge>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div><dt className="text-muted-foreground">Guest</dt><dd>{booking.guest.name}</dd><dd className="break-all text-xs text-muted-foreground">{booking.guest.email}</dd></div>
                <div><dt className="text-muted-foreground">Dates</dt><dd>{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</dd></div>
                <div><dt className="text-muted-foreground">Total</dt><dd className="font-medium">{formatPrice(Number(booking.totalPrice), booking.currency)}</dd></div>
              </dl>
              {canCancel && <div className="mt-4 border-t pt-3"><AdminCancelBookingButton bookingId={booking.id} /></div>}
            </article>
      </div>
      <div className="hidden border rounded-lg md:block">
        <Table className="table-stacked">
          <TableHeader>
            <TableRow>
              <TableHead>Listing</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
                <TableRow key={booking.id}>
                  <TableCell data-label="Listing">
                    <div className="text-sm font-medium max-w-[200px] truncate">{booking.listing.title}</div>
                    <div className="text-xs text-muted-foreground">{booking.listing.property.city}</div>
                  </TableCell>
                  <TableCell data-label="Guest">
                    <div className="text-sm">{booking.guest.name}</div>
                    <div className="text-xs text-muted-foreground">{booking.guest.email}</div>
                  </TableCell>
                  <TableCell className="text-sm" data-label="Dates">
                    {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
                  </TableCell>
                  <TableCell className="font-medium" data-label="Total">{formatPrice(Number(booking.totalPrice), booking.currency)}</TableCell>
                  <TableCell data-label="Status">
                    <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                      {statusConfig?.label || booking.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canCancel && <AdminCancelBookingButton bookingId={booking.id} />}
                  </TableCell>
                </TableRow>
          </TableBody>
        </Table>
      </div>
            </>,
          };
        })}
      />
    </div>
  );
}
