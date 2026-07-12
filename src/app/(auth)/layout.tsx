import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-secondary/15 blur-3xl"
      />

      <Link href="/" className="relative mb-8">
        <BrandLogo compact className="h-9 w-auto" />
      </Link>

      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
