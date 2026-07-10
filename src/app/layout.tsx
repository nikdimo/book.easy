import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { SITE_DOMAIN, SITE_TITLE_DEFAULT, SITE_TITLE_SUFFIX } from "@/lib/branding";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Was `force-dynamic` (disabling all static/PPR optimization app-wide, including pages
// with no per-request data needs). Pages that genuinely need per-request freshness
// already get it on their own merits: `(public)/properties` reads `searchParams`
// (auto-dynamic), and admin/host/account pages read the session (auto-dynamic). A
// bounded ISR window is a safer default for the rest — bounds staleness instead of
// removing caching entirely. Build-time DB unavailability is handled per-page (see
// `(public)/page.tsx`'s try/catch), not by this flag.
export const revalidate = 60;

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE_DEFAULT,
    template: `%s | ${SITE_TITLE_SUFFIX}`,
  },
  description:
    `Discover and book stays on ${SITE_DOMAIN} — unique homes across North Macedonia and beyond.`,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
