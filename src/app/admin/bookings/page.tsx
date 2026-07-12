import Link from "next/link";
import { getAllBookingsForAdmin } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminCancelBookingButton } from "@/components/admin/admin-cancel-booking-button";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";

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
      <div className="space-y-3 md:hidden">
        {filteredBookings.map((booking) => {
          const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
          const canCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";
          return (
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
                <div><dt className="text-muted-foreground">Total</dt><dd className="font-medium">{formatPrice(Number(booking.totalPrice))}</dd></div>
              </dl>
              {canCancel && <div className="mt-4 border-t pt-3"><AdminCancelBookingButton bookingId={booking.id} /></div>}
            </article>
          );
        })}
      </div>
      <div className="hidden border rounded-lg md:block">
        <Table>
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
            {filteredBookings.map((booking) => {
              const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
              const canCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";
              return (
                <TableRow key={booking.id}>
                  <TableCell>
                    <div className="text-sm font-medium max-w-[200px] truncate">{booking.listing.title}</div>
                    <div className="text-xs text-muted-foreground">{booking.listing.property.city}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{booking.guest.name}</div>
                    <div className="text-xs text-muted-foreground">{booking.guest.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
                  </TableCell>
                  <TableCell className="font-medium">{formatPrice(Number(booking.totalPrice))}</TableCell>
                  <TableCell>
                    <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                      {statusConfig?.label || booking.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canCancel && <AdminCancelBookingButton bookingId={booking.id} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
