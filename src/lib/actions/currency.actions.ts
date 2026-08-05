"use server";

import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  DISPLAY_CURRENCY_COOKIE,
  DISPLAY_CURRENCY_EXPLICIT_COOKIE,
  normalizeCurrencyCode,
} from "@/lib/currency/currency-preference";
import { EXCHANGE_RATES_TAG } from "@/lib/currency/rates";

const COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

/** Mirrors `storeAccountLocale`: the cookie lives in one browser, so the account is
 *  the only place a preference can survive to another device. Never creates an
 *  account and never blocks the change if the write fails. */
async function storeAccountCurrency(currency: string): Promise<void> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return;
    await db.user.update({
      where: { id: userId },
      data: { displayCurrency: currency },
    });
  } catch (error) {
    console.warn("[currency] could not store account display currency", error);
  }
}

/**
 * Records the guest's display-currency choice.
 *
 * Writing the cookie is what makes the choice stick and what makes it outrank IP
 * detection on every later request — the proxy reads it before it ever looks at
 * `cf-ipcountry`, which is how a VPN or a trip abroad stops re-pricing the site for
 * someone who has already chosen.
 *
 * The caller refreshes the router afterwards rather than reloading the page, so
 * prices re-render from the server in the new currency while the map viewport,
 * open dialogs and any half-finished booking form stay exactly as they were.
 */
export async function setDisplayCurrency(code: string) {
  const currency = normalizeCurrencyCode(code);
  if (!currency) return { error: "Unsupported currency." };

  const store = await cookies();
  store.set(DISPLAY_CURRENCY_COOKIE, currency, COOKIE_OPTIONS);
  store.set(DISPLAY_CURRENCY_EXPLICIT_COOKIE, "1", COOKIE_OPTIONS);

  await storeAccountCurrency(currency);
  return { success: true, currency };
}

/** Forces the next request to refetch rates instead of waiting out the cache
 *  window. Admin-only: it reaches the upstream provider. */
export async function refreshExchangeRates() {
  await requireAdmin();
  revalidateTag(EXCHANGE_RATES_TAG, "max");
  return { success: true };
}
