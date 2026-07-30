import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Home,
  CalendarDays,
  Clock,
  CheckCircle,
  MessageCircle,
  ShieldAlert,
  Bell,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { getHostDashboardStats } from "@/lib/services/listing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getHostAttentionSummary } from "@/lib/services/attention.service";

export const metadata = { title: "Host Dashboard" };

export default async function HostDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [stats, attention] = await Promise.all([
    getHostDashboardStats(session.user.id),
    getHostAttentionSummary(session.user.id),
  ]);

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

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Needs your attention</h2>
            <p className="text-sm text-muted-foreground">
              Tasks that may need a reply or decision.
            </p>
          </div>
          <span className="rounded-full bg-destructive px-3 py-1 text-sm font-bold text-destructive-foreground">
            {attention.total}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              label: "Booking requests",
              value: attention.pendingBookings,
              href: "/host/bookings",
              icon: Clock,
              copy: "Accept or decline new requests.",
            },
            {
              label: "Unread conversations",
              value: attention.unreadThreads,
              href: "/host/inbox",
              icon: MessageCircle,
              copy: "Reply to guests and inquiries.",
            },
            {
              label: "Damage reports",
              value: attention.damageReports,
              href: "/host/inbox",
              icon: ShieldAlert,
              copy: "Review reported property damage.",
            },
          ].map((item) => (
            <Link key={item.label} href={item.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">{item.label}</CardTitle>
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{item.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.copy}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Latest notifications</h2>
            <p className="text-sm text-muted-foreground">
              New activity across bookings, messages, and reports.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/account/notifications">
              <Bell className="mr-2 h-4 w-4" />
              View all
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="divide-y p-0">
            {attention.recentNotifications.length ? (
              attention.recentNotifications.map((item) => (
                <Link
                  key={item.id}
                  href={item.route ?? "/account/notifications"}
                  className="flex items-start gap-3 px-4 py-4 hover:bg-muted/50"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {item.body}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You are all caught up.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
