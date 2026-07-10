import { redirect } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { completePastBookings } from "@/lib/services/booking.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { BOOKING_STATUSES } from "@/lib/constants";

export const metadata = { title: "My Bookings" };

export default async function MyBookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await completePastBookings();
  const bookings = await db.booking.findMany({
    where: { guestId: session.user.id },
    include: {
      listing: {
        include: {
          property: true,
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (bookings.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">My Bookings</h1>
        <EmptyState
          title="No bookings yet"
          description="Start exploring and book your first stay!"
        >
          <Button asChild>
            <Link href="/properties">Browse Properties</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Bookings</h1>
      <div className="space-y-4">
        {bookings.map((booking) => {
          const statusConfig = BOOKING_STATUSES.find((s) => s.value === booking.status);
          return (
            <Link key={booking.id} href={`/account/bookings/${booking.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="flex gap-4 p-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold">{booking.listing.title}</h3>
                      <Badge variant={booking.status === "CONFIRMED" ? "default" : "secondary"}>
                        {statusConfig?.label || booking.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {booking.listing.property.city}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
                      </span>
                      <span className="font-medium">{formatPrice(Number(booking.totalPrice))}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
