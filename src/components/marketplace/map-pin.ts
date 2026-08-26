"use client";

import { useDisplayCurrency } from "@/lib/currency/client";

/**
 * One listing on the map.
 *
 * The price is carried as an amount plus the listing's own currency rather than as a
 * formatted label, so every surface that shows a pin — the marker itself, the popup,
 * the docked card on a phone — formats it from the display currency in context at the
 * moment it renders. A pre-formatted label froze whatever currency the map was first
 * rendered in, which is what let a cached map keep quoting the old one after the
 * visitor changed currency.
 */
export type MapPin = {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  /** A nightly rate, or the stay total when the search carries dates. Null for a
   *  listing with no pricing rule, which shows a dash. */
  price: { amount: number; currency: string } | null;
  title: string;
  location: string;
  imageUrl?: string;
  imageAlt?: string;
  /** Query string (no leading "?") carrying the current search's dates/guests to the listing page. */
  query?: string;
};

/** The pin's price in the currency the visitor is browsing in, formatted for the
 *  reading locale. Falls back to the listing's official currency exactly the way every
 *  other price on the page does, because it is the same formatter. */
export function usePinLabel(): (pin: MapPin) => string {
  const display = useDisplayCurrency();
  return (pin) =>
    pin.price ? display.format(pin.price.amount, pin.price.currency).text : "—";
}
