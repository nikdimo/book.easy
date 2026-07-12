import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, CalendarDays, Clock, CheckCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHostDashboardStats } from "@/lib/services/listing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Host Dashboard" };

export default async function HostDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const stats = await getHostDashboardStats(session.user.id);

  const statCards = [
    { label: "My Listings", value: stats.listings, icon: Home, href: "/host/listings" },
    { label: "Pending Requests", value: stats.pendingBookings, icon: Clock, href: "/host/bookings" },
    { label: "Confirmed", value: stats.confirmedBookings, icon: CheckCircle, href: "/host/bookings" },
    { label: "Total Bookings", value: stats.totalBookings, icon: CalendarDays, href: "/host/bookings" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Host Dashboard</h1>
        <Button asChild>
          <Link href="/host/listings/new">Create Listing</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow">
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
          </Link>
        ))}
      </div>
    </div>
  );
}
