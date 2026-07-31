"use client";

import { addDays, startOfToday } from "date-fns";
import { useState } from "react";
import { MarketplaceStayDatePicker } from "@/components/marketplace/marketplace-stay-date-picker";

const today = startOfToday();

export function MinStayLab() {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <div className="overflow-hidden rounded-xl border border-foreground/50 bg-background">
        <MarketplaceStayDatePicker
          layout="compact"
          checkIn={checkIn}
          checkOut={checkOut}
          showDateFlexibility
          showGuestStep={false}
          closeOnRangeComplete
          pagedCalendarOnDesktop
          disabledDateRanges={[
            { from: addDays(today, 12), to: addDays(today, 15) },
          ]}
          minimumStayNights={3}
          minimumStayMessage={{
            text: "Minimum stay is 3 nights",
            translated: false,
          }}
          onRangeStringsChange={({ checkIn: ci, checkOut: co }) => {
            setCheckIn(ci);
            setCheckOut(co);
          }}
          className="w-full"
        />
      </div>
    </div>
  );
}
