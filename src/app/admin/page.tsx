import Link from "next/link";
import { getAdminDashboardStats } from "@/lib/services/admin.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Users, CalendarDays, Clock, CheckCircle, AlertTriangle } from "lucide-react";

export const metadata = { title: "Admin Dashboard" };

export default async function AdminDashboardPage() {
  const {
    totalUsers, totalHosts, totalListings, pendingListings,
    approvedListings, totalBookings, pendingBookings, confirmedBookings,
  } = await getAdminDashboardStats();

  const stats = [
    {
      label: "Total Users",
      value: totalUsers,
      icon: Users,
      href: "/admin/users",
      ariaLabel: `View all ${totalUsers} users`,
    },
    {
      label: "Hosts",
      value: totalHosts,
      icon: Users,
      href: "/admin/users?type=hosts",
      ariaLabel: `View ${totalHosts} hosts`,
    },
    {
      label: "Total Listings",
      value: totalListings,
      icon: Home,
      href: "/admin/listings",
      ariaLabel: `View all ${totalListings} listings`,
    },
    {
      label: "Pending Review",
      value: pendingListings,
      icon: AlertTriangle,
      href: "/admin/listings?status=PENDING_REVIEW",
      ariaLabel: `${pendingListings} listings pending review`,
    },
    {
      label: "Published Listings",
      value: approvedListings,
      icon: CheckCircle,
      href: "/admin/listings?status=APPROVED",
      ariaLabel: `View ${approvedListings} published listings`,
    },
    {
      label: "Total Bookings",
      value: totalBookings,
      icon: CalendarDays,
      href: "/admin/bookings",
      ariaLabel: `View all ${totalBookings} bookings`,
    },
    {
      label: "Pending Bookings",
      value: pendingBookings,
      icon: Clock,
      href: "/admin/bookings?status=PENDING",
      ariaLabel: `View ${pendingBookings} pending bookings`,
    },
    {
      label: "Confirmed Bookings",
      value: confirmedBookings,
      icon: CheckCircle,
      href: "/admin/bookings?status=CONFIRMED",
      ariaLabel: `View ${confirmedBookings} confirmed bookings`,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const card = (
            <Card className="h-full cursor-pointer transition-colors hover:bg-muted/40">
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
          );

          return (
            <Link
              key={stat.label}
              href={stat.href}
              aria-label={stat.ariaLabel}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {card}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
