import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { getT, t, ti } from "@/lib/i18n/t";

type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED_BY_GUEST"
  | "CANCELLED_BY_HOST"
  | "CANCELLED_BY_ADMIN"
  | "COMPLETED";

export async function BookingStatusHero({
  status,
  reference,
  responseDueAt,
  hostName,
  audience = "guest",
  titleOverride,
  bodyOverride,
}: {
  status: BookingStatus;
  reference: string;
  responseDueAt: Date;
  hostName?: string;
  audience?: "guest" | "host";
  titleOverride?: ReactNode;
  bodyOverride?: ReactNode;
}) {
  const translator = await getT();
  const deadline = new Intl.DateTimeFormat(translator.locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(responseDueAt);
  const copy =
    status === "PENDING"
      ? {
          icon: Clock3,
          title:
            audience === "host"
              ? t(translator, "booking.hero.response_required", "Your response is required")
              : ti(translator, "booking.hero.waiting_approval", "Waiting for {hostName}'s approval", { hostName: hostName || t(translator, "booking.hero.the_host", "the host") }).text,
          body:
            audience === "host"
              ? ti(translator, "booking.hero.respond_by", "Accept or decline this request by {deadline}.", { deadline }).text
              : ti(translator, "booking.hero.host_deadline", "The host has until {deadline} to respond. This is not a confirmed reservation yet.", { deadline }).text,
          tone: "border-amber-200 bg-amber-50 text-amber-950",
        }
      : status === "CONFIRMED"
        ? {
            icon: CheckCircle2,
            title: t(translator, "booking.hero.confirmed", "Booking confirmed"),
            // Linger Homes never charges the guest, so the moment the host accepts is
            // the moment payment becomes the two of them arranging it between
            // themselves. Both sides are told the same thing from their own side.
            body:
              audience === "host"
                ? t(translator, "booking.hero.accepted_host", "The guest has been notified. Share your payment instructions with the guest directly. These dates remain blocked in your calendar.")
                : t(translator, "booking.hero.accepted_guest", "Your booking has been accepted. The host will share payment instructions with you."),
            tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
          }
        : status === "COMPLETED"
          ? {
              icon: CheckCircle2,
              title: t(translator, "booking.hero.completed", "Stay completed"),
              body: t(translator, "booking.hero.completed_body", "The stay is complete. You can now leave a review."),
              tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
            }
          : {
              icon: status === "EXPIRED" ? Clock3 : status === "REJECTED" ? XCircle : CircleAlert,
              title:
                status === "EXPIRED"
                  ? t(translator, "booking.hero.expired", "Booking request expired")
                  : status === "REJECTED"
                    ? t(translator, "booking.hero.declined", "Booking request declined")
                    : t(translator, "booking.hero.cancelled", "Booking cancelled"),
              body:
                status === "EXPIRED"
                  ? t(translator, "booking.hero.expired_body", "The host did not respond before the deadline. This did not become a reservation.")
                  : status === "REJECTED"
                    ? t(translator, "booking.hero.declined_body", "This request was not accepted and did not become a reservation.")
                    : t(translator, "booking.hero.cancelled_body", "This booking is no longer active."),
              tone: "border-stone-200 bg-stone-50 text-stone-950",
            };
  const Icon = copy.icon;

  return (
    <section className={cn("rounded-2xl border p-5 sm:p-6", copy.tone)}>
      <div className="flex items-start gap-4">
        <span className="rounded-full bg-white/80 p-2 shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
            {reference}
          </p>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">
            {titleOverride ?? copy.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 opacity-80">
            {bodyOverride ?? copy.body}
          </p>
        </div>
      </div>
    </section>
  );
}
