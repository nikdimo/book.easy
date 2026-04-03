import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Calendar, MapPin, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPrice, formatGuestCount } from "@/lib/utils/format";

interface ConfirmPageProps {
  searchParams: Promise<{ id?: string }>;
}

export const metadata = {
  title: "Booking Confirmed",
};

export default async function BookingConfirmPage({ searchParams }: ConfirmPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await searchParams;
  if (!id) redirect("/");

  const booking = await db.booking.findFirst({
    where: { id, guestId: session.user.id },
    include: {
      listing: {
        include: {
          property: true,
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
  });

  if (!booking) redirect("/");

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <div className="text-center mb-8">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">Booking Request Sent!</h1>
        <p className="text-muted-foreground">
          Your booking request has been submitted. The host will review and respond.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Booking Details</CardTitle>
            <Badge variant="secondary">Pending</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">{booking.listing.title}</h3>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="h-3 w-3" />
              {booking.listing.property.city}, {booking.listing.property.country}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Check-in</p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(booking.checkIn)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out</p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(booking.checkOut)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Guests</p>
              <p className="font-medium flex items-center gap-1">
                <Users className="h-3 w-3" />
                {formatGuestCount(booking.guestCount)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Nights</p>
              <p className="font-medium">{booking.numberOfNights}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{formatPrice(Number(booking.nightlyRate))} x {booking.numberOfNights} nights</span>
              <span>{formatPrice(Number(booking.nightlyRate) * booking.numberOfNights)}</span>
            </div>
            {Number(booking.cleaningFee) > 0 && (
              <div className="flex justify-between">
                <span>Cleaning fee</span>
                <span>{formatPrice(Number(booking.cleaningFee))}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span>{formatPrice(Number(booking.totalPrice))}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Booking reference: {booking.id.slice(0, 8).toUpperCase()}
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-6 justify-center">
        <Button asChild>
          <Link href="/account/bookings">View My Bookings</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/properties">Continue Browsing</Link>
        </Button>
      </div>
    </div>
  );
}
