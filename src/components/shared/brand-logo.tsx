import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Image
      src={compact ? "/branding/book-easy-symbol.png" : "/branding/book-easy-primary.png"}
      alt="Book Easy"
      width={compact ? 120 : 560}
      height={150}
      unoptimized
      className={cn("h-auto w-auto", className)}
    />
  );
}
