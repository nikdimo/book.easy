import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

export function LocalizedPrice({
  amount,
  currency = "EUR",
  locale,
  className,
}: {
  amount: number | string;
  currency?: string;
  locale: string;
  className?: string;
}) {
  return (
    <span
      className={cn("notranslate", className)}
      translate="no"
      suppressHydrationWarning
    >
      {formatPrice(amount, currency, locale)}
    </span>
  );
}
