import Image from "next/image";
import { Fredoka } from "next/font/google";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/branding";

const wordmarkFont = Fredoka({
  subsets: ["latin"],
  weight: "500",
  display: "swap",
});

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (!compact) {
    return (
      <span
        aria-label={PRODUCT_NAME}
        className={cn("notranslate h-12 w-fit shrink-0", className)}
        translate="no"
      >
        <span className="inline-flex h-full items-center gap-2.5">
          <Image
            src="/branding/linger-homes-symbol.svg"
            alt=""
            width={120}
            height={150}
            unoptimized
            className="h-full w-auto shrink-0"
          />
          <span
            aria-hidden="true"
            className={cn(
              wordmarkFont.className,
              "whitespace-nowrap text-[1.75rem] leading-none font-medium tracking-[-0.045em]"
            )}
          >
            <span className="text-primary">linger</span>
            <span className="text-foreground"> homes</span>
          </span>
        </span>
      </span>
    );
  }

  return (
    <Image
      src="/branding/linger-homes-symbol.svg"
      alt={PRODUCT_NAME}
      width={120}
      height={150}
      unoptimized
      className={cn("notranslate h-auto w-auto", className)}
      translate="no"
    />
  );
}
