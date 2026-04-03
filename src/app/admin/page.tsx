import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Users, CalendarDays, Clock, CheckCircle, AlertTriangle } from "lucide-react";

export const metadata = { title: "Admin Dashboard" };

export default async function AdminDashboardPage() {
  const [
    totalUsers, totalHosts, totalListings, pendingListings,
    approvedListings, totalBookings, pendingBookings, confirmedBookings,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isHost: true } }),
    db.listing.count(),
    db.listing.count({ where: { status: "PENDING_REVIEW" } }),
    db.listing.count({ where: { status: "APPROVED" } }),
    db.booking.count(),
    db.booking.count({ where: { status: "PENDING" } }),
    db.booking.count({ where: { status: "CONFIRMED" } }),
  ]);

  const stats = [
    { label: "Total Users", value: totalUsers, icon: Users },
    { label: "Hosts", value: totalHosts, icon: Users },
    { label: "Total Listings", value: totalListings, icon: Home },
    { label: "Pending Review", value: pendingListings, icon: AlertTriangle },
    { label: "Published Listings", value: approvedListings, icon: CheckCircle },
    { label: "Total Bookings", value: totalBookings, icon: CalendarDays },
    { label: "Pending Bookings", value: pendingBookings, icon: Clock },
    { label: "Confirmed Bookings", value: confirmedBookings, icon: CheckCircle },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
