import type { Metadata } from "next";
import { Inter, Manrope, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ConsentBanner } from "@/components/shared/consent-banner";
import { TranslateDomGuard } from "@/components/shared/translate-dom-guard";
import { GoogleTranslateController } from "@/components/shared/google-translate-controller";
import "./globals.css";
import {
  PRODUCT_NAME,
  SITE_TITLE_DEFAULT,
  SITE_TITLE_SUFFIX,
  SITE_URL,
} from "@/lib/branding";
import { getLocale, getT, localeDirection } from "@/lib/i18n/t";
import { I18nProvider } from "@/lib/i18n/client";
import { getEnabledLanguages } from "@/lib/services/language.service";

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
  // Two different locales, and conflating them is a bug rather than a simplification.
  // `translator.locale` is the *catalog* locale: what the fixed copy below actually
  // resolved to, which falls back to English whenever the requested language has no
  // enabled reviewed catalog. `requestedLocale` is what the visitor chose. Google's
  // translation target and the persisted cookies must follow the choice — handing the
  // catalog locale to the controller made `syncBrowserLanguageCookies` overwrite an
  // automatic (Google-only) selection with English on the very next page load.
  const [translator, requestedLocale, languages] = await Promise.all([
    getT(),
    getLocale(),
    getEnabledLanguages(),
  ]);
  return (
    <html
      // `lang` describes the text actually served, which is the catalog locale — English
      // whenever the requested language has no reviewed catalog. Google rewrites this
      // attribute itself once it translates the document.
      lang={translator.locale}
      // Direction follows the choice instead, because it has to be right for the text the
      // visitor ends up reading rather than the source it is translated from. Every RTL
      // language is Google-only (none are reviewed), so keying this to the catalog locale
      // meant `localeDirection` could never once return "rtl" — and Google ships no rule
      // for the `translated-rtl` class it adds, so nothing else would have set it either.
      dir={localeDirection(requestedLocale)}
      className={`${manrope.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TranslateDomGuard />
        <GoogleTranslateController locale={requestedLocale} />
        <I18nProvider
          locale={translator.locale}
          requestedLocale={requestedLocale}
          messages={translator.messages}
        >
          <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
            <TooltipProvider>
              {children}
              {modal}
              <Toaster richColors position="top-right" />
              <ConsentBanner
                languages={languages}
                currentLocale={requestedLocale}
              />
            </TooltipProvider>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
