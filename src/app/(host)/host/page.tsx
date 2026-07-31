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
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "Host Dashboard" };

export default async function HostDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [stats, attention] = await Promise.all([
    getHostDashboardStats(session.user.id),
    getHostAttentionSummary(session.user.id),
  ]);
  const t = await getT();

  // Card copy is resolved at the point of definition rather than rendered through <T>:
  // these arrays are mapped over below, and the extractor only reads literal key and
  // source arguments.
  const statCards = [
    {
      id: "listings",
      label: t.resolve("host.dashboard.my_listings", "My Listings"),
      value: stats.listings,
      icon: Home,
      href: "/host/listings",
    },
    {
      id: "pending",
      label: t.resolve("host.dashboard.pending_requests", "Pending Requests"),
      value: stats.pendingBookings,
      icon: Clock,
      href: "/host/bookings",
    },
    {
      id: "confirmed",
      label: t.resolve("host.dashboard.confirmed", "Confirmed"),
      value: stats.confirmedBookings,
      icon: CheckCircle,
      href: "/host/bookings",
    },
    {
      id: "total",
      label: t.resolve("host.dashboard.total_bookings", "Total Bookings"),
      value: stats.totalBookings,
      icon: CalendarDays,
      href: "/host/bookings",
    },
  ];

  const attentionCards = [
    {
      id: "bookings",
      label: t.resolve("host.dashboard.attention.bookings", "Booking requests"),
      value: attention.pendingBookings,
      href: "/host/bookings",
      icon: Clock,
      copy: t.resolve(
        "host.dashboard.attention.bookings_copy",
        "Accept or decline new requests.",
      ),
    },
    {
      id: "conversations",
      label: t.resolve(
        "host.dashboard.attention.conversations",
        "Unread conversations",
      ),
      value: attention.unreadThreads,
      href: "/host/inbox",
      icon: MessageCircle,
      copy: t.resolve(
        "host.dashboard.attention.conversations_copy",
        "Reply to guests and inquiries.",
      ),
    },
    {
      id: "damage",
      label: t.resolve("host.dashboard.attention.damage", "Damage reports"),
      value: attention.damageReports,
      href: "/host/inbox",
      icon: ShieldAlert,
      copy: t.resolve(
        "host.dashboard.attention.damage_copy",
        "Review reported property damage.",
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">
          <T t={t} k="host.dashboard.heading" source="Host Dashboard" />
        </h1>
        <Button asChild>
          <Link href="/host/listings/new">
            <T t={t} k="host.dashboard.create_listing" source="Create Listing" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.id} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <span className={stat.label.translated ? "notranslate" : undefined}>
                    {stat.label.text}
                  </span>
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
            <h2 className="text-xl font-semibold">
              <T
                t={t}
                k="host.dashboard.attention.heading"
                source="Needs your attention"
              />
            </h2>
            <p className="text-sm text-muted-foreground">
              <T
                t={t}
                k="host.dashboard.attention.subheading"
                source="Tasks that may need a reply or decision."
              />
            </p>
          </div>
          <span className="rounded-full bg-destructive px-3 py-1 text-sm font-bold text-destructive-foreground">
            {attention.total}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {attentionCards.map((item) => (
            <Link key={item.id} href={item.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">
                    <span className={item.label.translated ? "notranslate" : undefined}>
                      {item.label.text}
                    </span>
                  </CardTitle>
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{item.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className={item.copy.translated ? "notranslate" : undefined}>
                      {item.copy.text}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              <T
                t={t}
                k="host.dashboard.notifications.heading"
                source="Latest notifications"
              />
            </h2>
            <p className="text-sm text-muted-foreground">
              <T
                t={t}
                k="host.dashboard.notifications.subheading"
                source="New activity across bookings, messages, and reports."
              />
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/account/notifications">
              <Bell className="mr-2 h-4 w-4" />
              <T t={t} k="host.dashboard.notifications.view_all" source="View all" />
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
                <T
                  t={t}
                  k="host.dashboard.notifications.empty"
                  source="You are all caught up."
                />
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
