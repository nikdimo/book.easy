import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CircleCheck,
  CircleAlert,
  CalendarDays,
  Sparkles,
  MessageCircle,
  Plus,
} from "lucide-react";
import { requireHostPage } from "@/lib/auth-helpers";
import { getHostAttentionSummary } from "@/lib/services/attention.service";
import { getT, T, TWithValues } from "@/lib/i18n/t";

export const metadata = { title: "New Host Panel Preview" };

export default async function HostV2TodayPage() {
  const user = await requireHostPage();
  const [attention, t] = await Promise.all([getHostAttentionSummary(user.id), getT()]);

  const firstName = user.name?.split(" ")[0] || "Host";
  const nextCheckInDate = attention.upcomingStay
    ? new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "long" }).format(
        attention.upcomingStay.checkIn
      )
    : null;
  const attentionRows = [
    {
      label: t.resolve("host.v2.attention.booking_requests", "Booking requests"),
      value: attention.pendingBookings,
      href: "/host/v2/reservations",
      icon: CalendarCheck,
    },
    {
      label: t.resolve("host.v2.attention.unread_messages", "Unread messages"),
      value: attention.unreadThreads,
      href: "/host/v2/messages",
      icon: MessageCircle,
    },
    {
      label: t.resolve("host.v2.attention.damage_reports", "Damage reports"),
      value: attention.damageReports,
      href: "/host/inbox",
      icon: CircleAlert,
    },
  ].filter((item) => item.value > 0);

  const assistantUpdate = attention.pendingBookings > 0
    ? t.resolve(
        "host.v2.assistant.booking_request",
        "Good news, {name} — a booking request is ready to review."
      )
    : attention.unreadThreads > 0
      ? t.resolve(
          "host.v2.assistant.unread_message",
          "A guest is waiting to hear from you."
        )
      : attention.damageReports > 0
        ? t.resolve(
            "host.v2.assistant.damage_report",
            "A guest report is ready for your review."
          )
        : t.resolve("host.v2.assistant.copy", "A quick update from your homes.");

  const caughtUpSuggestion =
    attention.firstActiveListing && attention.confirmedBookingCount === 0
      ? {
          icon: Sparkles,
          href: `/host/listings/${attention.firstActiveListing.id}/promotion`,
          title: t.resolve(
            "host.v2.assistant.promotion.title",
            "Want to attract your next booking?"
          ),
          copy: t.resolve(
            "host.v2.assistant.promotion.copy",
            "A promotion can help more guests discover your home."
          ),
          action: t.resolve("host.v2.assistant.promotion.action", "Explore promotions"),
        }
      : attention.upcomingStay
        ? {
            icon: CalendarDays,
            href: `/host/listings/${attention.upcomingStay.listingId}/availability`,
          title: t.resolve(
            "host.v2.assistant.upcoming.title",
            "Your next guest arrives on {date}."
          ),
            copy: t.resolve(
              "host.v2.assistant.upcoming.copy",
              "Everything is in place. We’ll let you know if anything changes."
            ),
            action: t.resolve("host.v2.assistant.upcoming.action", "View calendar"),
          }
        : null;

  return (
    <div className="mx-auto max-w-6xl space-y-7 md:space-y-10">
      <section className="border-b border-slate-100 pb-6 sm:pb-8">
        <div>
          <h1 className="font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-tight md:text-4xl">
            {t
              .resolve("host.v2.today.greeting", "Welcome back, {name}")
              .text.replace("{name}", firstName)}
          </h1>
        </div>
      </section>

      <section aria-labelledby="host-attention-heading" className="max-w-4xl">
        <div>
          <h2 id="host-attention-heading" className="text-xl font-semibold tracking-tight">
            <T t={t} k="host.v2.assistant.heading" source="Your host assistant" />
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {assistantUpdate.text.replace("{name}", firstName)}
          </p>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl bg-slate-50">
          {attentionRows.length > 0 ? (
            <div className="divide-y divide-white">
              {attentionRows.map((item) => (
                <Link
                  key={item.href + item.label.text}
                  href={item.href}
                  className="group flex min-h-16 items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#d9774f] md:px-5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-slate-600">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{item.label.text}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-sm font-semibold tabular-nums text-slate-700">
                    {item.value}
                  </span>
                  <ArrowRight
                    className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-4 px-4 py-5 md:px-5 md:py-6">
              <div className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-emerald-700">
                  <CircleCheck className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-800">
                    <TWithValues
                      t={t}
                      k="host.v2.assistant.caught_up.title"
                      source="You’re all caught up, {name}."
                      values={{ name: firstName }}
                      protectedValues={["name"]}
                    />
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    <T
                      t={t}
                      k="host.v2.assistant.caught_up.copy"
                      source="Your guests and listings are in good shape. Enjoy the quiet moment."
                    />
                  </p>
                </div>
              </div>

              {caughtUpSuggestion ? (
                <Link
                  href={caughtUpSuggestion.href}
                  className="group flex items-center gap-3 rounded-xl bg-white px-3 py-3 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9774f]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#fff2eb] text-[#a94b28]">
                    <caughtUpSuggestion.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">
                      {caughtUpSuggestion.title.text.replace("{date}", nextCheckInDate ?? "")}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {caughtUpSuggestion.copy.text}
                    </span>
                  </span>
                  <span className="hidden text-sm font-semibold text-[#a94b28] sm:inline">
                    {caughtUpSuggestion.action.text}
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <Link
        href="/host/listings/new"
        className="fixed bottom-20 right-5 z-30 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#fde7dc] px-5 text-sm font-semibold text-[#8f3d21] shadow-sm transition-colors hover:bg-[#f9d7c6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9774f] md:bottom-8 md:right-8"
      >
        <Plus className="size-4" aria-hidden />
        <T t={t} k="host.v2.today.add_listing" source="Add listing" />
      </Link>
    </div>
  );
}
