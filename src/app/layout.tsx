import type { Metadata } from "next";
import { Inter, Manrope, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ConsentBanner } from "@/components/shared/consent-banner";
import "./globals.css";
import {
  PRODUCT_NAME,
  SITE_TITLE_DEFAULT,
  SITE_TITLE_SUFFIX,
  SITE_URL,
} from "@/lib/branding";
import { getT, localeDirection } from "@/lib/i18n/t";
import { I18nProvider } from "@/lib/i18n/client";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// No `revalidate` here on purpose. This layout calls `getT()`, which reads the
// synchronized locale cookies via `cookies()` — a request-time API — so every route
// beneath it renders dynamically and a segment-level `revalidate` would have no
// effect (it previously read as if it enabled app-wide ISR, which it did not).
// Serving a cached page in the wrong language would be a visible bug, and the app is
// request-dependent regardless: `(public)/properties` reads `searchParams`, and
// admin/host/account routes read the session. Build-time DB unavailability is handled
// per-page (see `(public)/page.tsx`'s try/catch), not by segment config.

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE_DEFAULT,
    template: `%s | ${SITE_TITLE_SUFFIX}`,
  },
  description: `Discover and book unique holiday homes and stays with ${PRODUCT_NAME}.`,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || SITE_URL),
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    url: SITE_URL,
  },
};

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const translator = await getT();
  return (
    <html
      lang={translator.locale}
      dir={localeDirection(translator.locale)}
      className={`${manrope.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={translator.locale} messages={translator.messages}>
          <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
            <TooltipProvider>
              {children}
              {modal}
              <Toaster richColors position="top-right" />
              <ConsentBanner />
            </TooltipProvider>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
