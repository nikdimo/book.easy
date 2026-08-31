import type { CancellationPolicySnapshotV1 } from "@/lib/payments/cancellation-policy";
import type { PaymentMethodLabelResolver } from "./accepted-payment-methods";
import { cn } from "@/lib/utils";

export function CancellationPolicySummary({
  t,
  data,
  appearance = "card",
  className,
}: {
  t: PaymentMethodLabelResolver;
  data: CancellationPolicySnapshotV1;
  /** `inline` drops the tile: inside a dialog the surrounding chrome is the frame. */
  appearance?: "card" | "inline";
  className?: string;
}) {
  const days = data.freeCancellationDaysBeforeCheckIn;
  return (
    <section
      className={cn(
        appearance === "card" &&
          "rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border/80 sm:p-5",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-foreground">
        {t.resolve("booking.cancellation.heading", "Cancellation policy").text}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {data.status !== "REVIEWED" || days === null
          ? t.resolve(
              "booking.cancellation.unanswered",
              "The host has not reviewed a cancellation deadline for this listing.",
            ).text
          : days === 0
            ? t.resolve(
                "booking.cancellation.zero_days",
                "Cancel before check-in begins for a full refund of accommodation payments already made.",
              ).text
            : t
                .resolve(
                  "booking.cancellation.days_before",
                  "Cancel at least {days} days before check-in for a full refund of accommodation payments already made.",
                )
                .text.replace("{days}", String(days))}
      </p>
      {data.status === "REVIEWED" ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t.resolve(
            "booking.cancellation.after_deadline",
            "After the deadline, the host may keep only an advance payment already received. A refundable damage deposit is separate and cannot be used as a cancellation fee.",
          ).text}
        </p>
      ) : null}
    </section>
  );
}
