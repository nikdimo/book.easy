"use client";

import * as React from "react";

export type ListingStayRange = { checkIn: string; checkOut: string };

/**
 * What the booking widget's primary button is offering right now, published so
 * other surfaces on the page can offer the same thing without re-deriving it.
 *
 * The label and the total are the widget's own — a second button that priced the
 * stay itself would be one rounding rule away from quoting a different number
 * than the card it hands the guest to.
 */
export type ListingBookingSnapshot = {
  /** The widget's primary action label, already resolved for the locale. */
  label: string;
  /** Whether that label came from the translation catalog, for `notranslate`. */
  labelTranslated: boolean;
  /** Nights in the current selection, or 0 when there is no priced stay. */
  nights: number;
  /** The stay total, in `currency`. Meaningless while `nights` is 0. */
  total: number;
  currency: string;
  /** True while a request is in flight, so mirrors disable with the card. */
  busy: boolean;
};

type ListingStayContextValue = ListingStayRange & {
  setRange: (next: ListingStayRange) => void;
  booking: ListingBookingSnapshot | null;
  publishBooking: (next: ListingBookingSnapshot | null) => void;
  startBooking: () => void;
  bindStartBooking: (start: (() => void) | null) => void;
};

const ListingStayContext = React.createContext<ListingStayContextValue | null>(
  null,
);

/**
 * One stay selection per listing page. The booking widget is mounted twice (a
 * desktop card and a mobile one, each hidden at the other breakpoint) and the
 * inline availability calendar is a third surface onto the same dates — without
 * a shared owner, picking dates in one leaves the others showing something else.
 */
export function ListingStayProvider({
  initialCheckIn = "",
  initialCheckOut = "",
  children,
}: {
  initialCheckIn?: string;
  initialCheckOut?: string;
  children: React.ReactNode;
}) {
  const [range, setRange] = React.useState<ListingStayRange>({
    checkIn: initialCheckIn,
    checkOut: initialCheckOut,
  });
  const [booking, publishBooking] =
    React.useState<ListingBookingSnapshot | null>(null);
  // The action itself stays in a ref rather than in state: it is a fresh closure on
  // every render of the widget, and storing it would re-render every consumer for a
  // function that does the same thing.
  const startRef = React.useRef<(() => void) | null>(null);
  const bindStartBooking = React.useCallback(
    (start: (() => void) | null) => {
      startRef.current = start;
    },
    [],
  );
  const startBooking = React.useCallback(() => {
    startRef.current?.();
  }, []);

  const value = React.useMemo<ListingStayContextValue>(
    () => ({
      ...range,
      setRange,
      booking,
      publishBooking,
      startBooking,
      bindStartBooking,
    }),
    [range, booking, startBooking, bindStartBooking],
  );

  return (
    <ListingStayContext.Provider value={value}>
      {children}
    </ListingStayContext.Provider>
  );
}

/**
 * Reads the shared selection when a provider is above, and falls back to its own
 * state otherwise, so the booking widget still works on surfaces that mount it
 * on its own.
 */
export function useListingStayRange(
  initial: ListingStayRange,
): [ListingStayRange, (next: ListingStayRange) => void] {
  const shared = React.useContext(ListingStayContext);
  const [local, setLocal] = React.useState(initial);
  const setRange = React.useCallback(
    (next: ListingStayRange) => {
      if (shared) shared.setRange(next);
      else setLocal(next);
    },
    [shared],
  );

  return [
    shared ? { checkIn: shared.checkIn, checkOut: shared.checkOut } : local,
    setRange,
  ];
}

/**
 * Lets the booking widget lend its primary action to the rest of the page.
 *
 * Called from the widget on every render; the snapshot is only pushed into state
 * when one of its values actually changed, so a mirror re-renders when the price
 * moves and not when the card merely re-rendered. A no-op without a provider.
 */
export function usePublishListingBooking(
  snapshot: ListingBookingSnapshot,
  start: () => void,
): void {
  const shared = React.useContext(ListingStayContext);
  const bind = shared?.bindStartBooking;
  const publish = shared?.publishBooking;

  React.useEffect(() => {
    if (!bind) return;
    bind(start);
    return () => bind(null);
  }, [bind, start]);

  const { label, labelTranslated, nights, total, currency, busy } = snapshot;
  React.useEffect(() => {
    if (!publish) return;
    publish({ label, labelTranslated, nights, total, currency, busy });
    return () => publish(null);
  }, [publish, label, labelTranslated, nights, total, currency, busy]);
}

/**
 * The booking action as another surface sees it: what to say on the button, what
 * the stay costs, and how to start it. Null until the widget has published one.
 */
export function useListingBooking(): {
  booking: ListingBookingSnapshot | null;
  startBooking: () => void;
} {
  const shared = React.useContext(ListingStayContext);
  const noop = React.useCallback(() => {}, []);
  return {
    booking: shared?.booking ?? null,
    startBooking: shared?.startBooking ?? noop,
  };
}
