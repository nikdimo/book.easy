import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  CircleAlert,
  CalendarDays,
  Download,
  House,
  HousePlus,
  Sparkles,
  MessageCircle,
  WalletCards,
} from "lucide-react";
import { requireHostPage } from "@/lib/auth-helpers";
import { getHostAttentionSummary } from "@/lib/services/attention.service";
import { hostCalendarHref } from "@/lib/host/v2/calendar-href";
import { hostMessagesHref } from "@/lib/host/v2/messages-href";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "New Host Panel Preview" };

/*
 * One card style for the whole screen: white, a hairline of shadow for depth, and no
 * fill. The tinted group this replaced put a grey plate behind rows that were already
 * distinct, which read as a disabled state rather than as something to tap.
 */
const CARD =
  "rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.24)]";

export default async function HostV2TodayPage() {
  const user = await requireHostPage();
  const [attention, t] = await Promise.all([getHostAttentionSummary(user.id), getT()]);

  const firstName = user.name?.split(" ")[0] || "Host";

  /*
   * A host who has not listed anything yet has no guests, no calendar and no messages,
   * so every row below would be empty and the calm "you're all caught up" line read as
   * a system that had forgotten why they signed up. Their Today is one thing: the way
   * in. It keeps the panel shell — the tabs stay reachable — but nothing else on this
   * screen competes with getting a first home listed.
   */
  if (attention.listingCount === 0) {
    const draftTitle =
      attention.latestDraft?.title?.trim() ||
      t.resolve("host.v2.today.first_listing.untitled_draft", "Untitled listing").text;

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-3 pb-24 pt-8 md:px-0 md:pb-20 md:pt-4">
        <h1 className="font-heading text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-slate-950 md:text-[2.5rem]">
          {t
            .resolve("host.v2.today.first_listing.greeting", "Welcome, {name}")
            .text.replace("{name}", firstName)}
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-500">
          <T
            t={t}
            k="host.v2.today.first_listing.copy"
            source="You haven't listed a home yet. Add your first one and start taking direct bookings — with 0% host commission."
          />
        </p>

        {/* The draft comes first when there is one: finishing something already begun
            is a smaller ask than starting over, and offering "create a new listing"
            above it would quietly invite a second abandoned draft. */}
        {attention.latestDraft ? (
          <Link
            href={`/host/start/resume?draft=${encodeURIComponent(attention.latestDraft.id)}`}
            className={`group mt-10 flex min-h-16 items-center gap-4 px-4 py-4 transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_12px_28px_-14px_rgba(15,23,42,0.32)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 md:px-5 ${CARD}`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-900">
              <House className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">
                <T
                  t={t}
                  k="host.v2.today.first_listing.resume"
                  source="Finish your listing"
                />
              </span>
              <span className="mt-0.5 block truncate text-sm text-slate-500">
                {draftTitle}
              </span>
            </span>
            <ChevronRight
              className="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ) : null}

        <Link
          href="/host/start/new"
          className={`inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full bg-[#0f172a] px-6 text-base font-semibold text-white transition-colors hover:bg-[#1e293b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${attention.latestDraft ? "mt-6" : "mt-10"}`}
        >
          <HousePlus className="size-5" strokeWidth={1.75} aria-hidden />
          {attention.latestDraft ? (
            <T
              t={t}
              k="host.v2.today.first_listing.create_another"
              source="Create a new listing"
            />
          ) : (
            <T
              t={t}
              k="host.v2.today.first_listing.create"
              source="Create your first listing"
            />
          )}
        </Link>

        {/* The second path stays a quiet line rather than a second button: importing is
            faster for a host who already lists elsewhere, but it is not the path most
            hosts are on, and two filled buttons make neither one the answer. */}
        <p className="mt-6 text-sm leading-6 text-slate-500">
          <T
            t={t}
            k="host.v2.today.first_listing.import_prompt"
            source="Already listed somewhere else?"
          />{" "}
          <Link
            href="/host/start/import"
            className="inline-flex items-center gap-1 font-medium text-slate-900 underline underline-offset-4 transition-colors hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <Download className="size-4" strokeWidth={1.5} aria-hidden />
            <T
              t={t}
              k="host.v2.today.first_listing.import"
              source="Import it from Airbnb, Booking.com and more"
            />
          </Link>
        </p>
      </div>
    );
  }
  const nextCheckInDate = attention.upcomingStay
    ? new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "long" }).format(
        attention.upcomingStay.checkIn
      )
    : null;
  const attentionRows = [
    ...(attention.incompletePaymentArrangements
      ? [
          {
            label: t.resolve(
              "host.v2.attention.payment_arrangements",
              "Complete payment arrangements",
            ),
            detail: t
              .resolve(
                "host.v2.attention.payment_arrangements_copy",
                "Tell guests how they can pay and whether a deposit is required for {title}.",
              )
              .text.replace(
                "{title}",
                attention.incompletePaymentArrangements.title,
              ),
            value: attention.incompletePaymentArrangementCount,
            href: `/host/listings/${attention.incompletePaymentArrangements.id}/payment-arrangements`,
            icon: WalletCards,
          },
        ]
      : []),
    {
      label: t.resolve("host.v2.attention.booking_requests", "Booking requests"),
      value: attention.pendingBookings,
      href: "/host/reservations",
      icon: CalendarCheck,
    },
    {
      label: t.resolve("host.v2.attention.unread_messages", "Unread messages"),
      value: attention.unreadThreads,
      href: hostMessagesHref(),
      icon: MessageCircle,
    },
    {
      label: t.resolve("host.v2.attention.damage_reports", "Damage reports"),
      value: attention.damageReports,
      // The newest open report's own thread when the host is in it — the V2 inbox
      // renders damage reports inline in the timeline — and the inbox itself
      // otherwise. Never the classic panel: that leaves the V2 shell behind.
      href: hostMessagesHref(attention.damageReportConversationId),
      icon: CircleAlert,
    },
  ].filter((item) => item.value > 0);

  const caughtUpSuggestion =
    attention.firstActiveListing && attention.confirmedBookingCount === 0
      ? {
          icon: Sparkles,
          // Promotions live inside the V2 calendar now, on the selected listing; the
          // classic `/host/listings/<id>/promotion` page is the old panel.
          href: hostCalendarHref(attention.firstActiveListing.id),
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
            href: hostCalendarHref(attention.upcomingStay.listingId),
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
    /*
     * The shell hands a phone the full viewport with no header above it, so this centres
     * itself in what is left rather than starting on the first pixel and leaving the
     * bottom two thirds empty. `justify-center` with `flex-1`, not a fixed top pad, so a
     * longer day (several attention rows) still grows downward and scrolls normally. The
     * bottom pad is heavier than the top on purpose: a block centred by arithmetic sits
     * low to the eye, and the extra pad below lifts it back to where it reads as centred.
     *
     * `px-3` is on top of the shell's own `px-5`, and only below `md`. A phone shows this
     * page as a single column against the screen edges, where the shell's gutter alone
     * leaves the greeting and the card looking pinned to the glass; on desktop the
     * max-width already does the work and extra padding would only narrow the column.
     *
     * One narrow centred column, not the 1440px frame the calendar wants: a greeting and
     * a card or two stretched across the full width sit off in the left third of a
     * desktop screen with nothing balancing them.
     */
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-3 pb-24 pt-8 md:px-0 md:pb-20 md:pt-4">
      <h1 className="font-heading text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-slate-950 md:text-[2.5rem]">
        {t
          .resolve("host.v2.today.greeting", "Welcome back, {name}")
          .text.replace("{name}", firstName)}
      </h1>
      {/* When there is nothing to act on, the status is a subtitle to the greeting
          rather than a card of its own — one thought, one block. A tick in a circle
          on top of it was a third way of saying the same calm thing. */}
      {attentionRows.length === 0 ? (
        <p className="mt-3 text-base leading-7 text-slate-500">
          <T
            t={t}
            k="host.v2.assistant.caught_up.copy"
            source="Your guests and listings are in good shape. Enjoy the quiet moment."
          />
        </p>
      ) : null}

      <section aria-label={t.resolve("host.v2.assistant.heading", "Your host assistant").text} className="mt-12 space-y-3">
        {attentionRows.length > 0 ? (
          attentionRows.map((item) => (
            <Link
              key={item.href + item.label.text}
              href={item.href}
              className={`group flex min-h-16 items-center gap-4 px-4 py-3 transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_12px_28px_-14px_rgba(15,23,42,0.32)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 md:px-5 ${CARD}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700">
                <item.icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.label.text}</span>
                {"detail" in item ? (
                  <span className="mt-0.5 block truncate text-sm text-slate-500">
                    {item.detail}
                  </span>
                ) : null}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-slate-800">
                {item.value}
              </span>
              <ArrowRight
                className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ))
        ) : (
          <>
            {caughtUpSuggestion ? (
              <Link
                href={caughtUpSuggestion.href}
                className={`group flex items-center gap-4 px-4 py-4 transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_12px_28px_-14px_rgba(15,23,42,0.32)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 md:px-5 ${CARD}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-900">
                  <caughtUpSuggestion.icon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">
                    {caughtUpSuggestion.title.text.replace("{date}", nextCheckInDate ?? "")}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    {caughtUpSuggestion.copy.text}
                  </span>
                </span>
                <span className="hidden text-sm font-semibold text-slate-900 sm:inline">
                  {caughtUpSuggestion.action.text}
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
