"use client";

import * as React from "react";

export type ListingStayRange = { checkIn: string; checkOut: string };

type ListingStayContextValue = ListingStayRange & {
  setRange: (next: ListingStayRange) => void;
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
  const value = React.useMemo<ListingStayContextValue>(
    () => ({ ...range, setRange }),
    [range],
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
