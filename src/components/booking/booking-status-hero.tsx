import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED_BY_GUEST"
  | "CANCELLED_BY_HOST"
  | "CANCELLED_BY_ADMIN"
  | "COMPLETED";

export function BookingStatusHero({
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
  const deadline = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(responseDueAt);
  const copy =
    status === "PENDING"
      ? {
          icon: Clock3,
          title:
            audience === "host"
              ? "Your response is required"
              : `Waiting for ${hostName || "the host"}’s approval`,
          body:
            audience === "host"
              ? `Accept or decline this request by ${deadline}.`
              : `The host has until ${deadline} to respond. This is not a confirmed reservation yet.`,
          tone: "border-amber-200 bg-amber-50 text-amber-950",
        }
      : status === "CONFIRMED"
        ? {
            icon: CheckCircle2,
            title: "Booking confirmed",
            body:
              audience === "host"
                ? "The guest has been notified. These dates remain blocked in your calendar."
                : "You’re all set. Use this page for messages, stay details and support.",
            tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
          }
        : status === "COMPLETED"
          ? {
              icon: CheckCircle2,
              title: "Stay completed",
              body: "The stay is complete. You can now leave a review.",
              tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
            }
          : {
              icon: status === "EXPIRED" ? Clock3 : status === "REJECTED" ? XCircle : CircleAlert,
              title:
                status === "EXPIRED"
                  ? "Booking request expired"
                  : status === "REJECTED"
                    ? "Booking request declined"
                    : "Booking cancelled",
              body:
                status === "EXPIRED"
                  ? "The host did not respond before the deadline. This did not become a reservation."
                  : status === "REJECTED"
                    ? "This request was not accepted and did not become a reservation."
                    : "This booking is no longer active.",
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
