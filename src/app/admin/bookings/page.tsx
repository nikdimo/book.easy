import { getAllBookingsForAdmin } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminCancelBookingButton } from "@/components/admin/admin-cancel-booking-button";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";

export const metadata = { title: "Admin - Bookings" };

export default async function AdminBookingsPage() {
  const bookings = await getAllBookingsForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Bookings</h1>
      <div className="border rounded-lg">
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
            {bookings.map((booking) => {
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
