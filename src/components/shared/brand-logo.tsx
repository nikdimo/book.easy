import Image from "next/image";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/branding";

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Image
      src={compact ? "/branding/linger-homes-symbol.svg" : "/branding/linger-homes-primary.svg"}
      alt={PRODUCT_NAME}
      width={compact ? 120 : 620}
      height={compact ? 150 : 150}
      unoptimized
      className={cn("h-auto w-auto", className)}
    />
  );
}
