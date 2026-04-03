"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent, useEffect } from "react";
import { Search, MapPin, CalendarRange, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Variant = "hero" | "compact";

export function MarketplaceSearchBar({
  variant = "hero",
  defaultCity = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  defaultGuests = "",
}: {
  variant?: Variant;
  defaultCity?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultGuests?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [city, setCity] = useState(
    () => defaultCity ?? searchParams.get("city") ?? ""
  );
  const [checkIn, setCheckIn] = useState(
    () => defaultCheckIn ?? searchParams.get("checkIn") ?? ""
  );
  const [checkOut, setCheckOut] = useState(
    () => defaultCheckOut ?? searchParams.get("checkOut") ?? ""
  );
  const [guests, setGuests] = useState(
    () => defaultGuests ?? searchParams.get("guests") ?? ""
  );

  useEffect(() => {
    setCity(defaultCity ?? searchParams.get("city") ?? "");
    setCheckIn(defaultCheckIn ?? searchParams.get("checkIn") ?? "");
    setCheckOut(defaultCheckOut ?? searchParams.get("checkOut") ?? "");
    setGuests(defaultGuests ?? searchParams.get("guests") ?? "");
  }, [searchParams, defaultCity, defaultCheckIn, defaultCheckOut, defaultGuests]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (city.trim()) p.set("city", city.trim());
    if (checkIn) p.set("checkIn", checkIn);
    if (checkOut) p.set("checkOut", checkOut);
    if (guests) p.set("guests", guests);
    const q = p.toString();
    router.push(q ? `/properties?${q}` : "/properties");
  }

  const isCompact = variant === "compact";

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "w-full bg-background shadow-lg border border-border/80",
        isCompact ? "rounded-full max-w-2xl" : "rounded-full max-w-4xl mx-auto"
      )}
    >
      <div
        className={cn(
          "flex flex-col md:flex-row md:items-stretch divide-y md:divide-y-0 md:divide-x divide-border/80",
          isCompact && "md:flex-nowrap"
        )}
      >
        <label
          className={cn(
            "flex-1 flex gap-3 px-4 py-3 md:py-2.5 cursor-text rounded-t-full md:rounded-l-full md:rounded-t-none hover:bg-muted/50 transition-colors",
            !isCompact && "md:pl-8 md:py-4"
          )}
        >
          <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-left">
            <span className="text-xs font-semibold tracking-wide block">Where</span>
            <Input
              name="city"
              placeholder="Search destinations"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="border-0 shadow-none h-7 px-0 text-sm md:text-base focus-visible:ring-0 placeholder:text-muted-foreground/70"
            />
          </div>
        </label>

        <div
          className={cn(
            "flex flex-1 min-w-0 divide-x divide-border/80",
            isCompact && "flex-row"
          )}
        >
          <label
            className={cn(
              "flex-1 flex gap-2 px-4 py-3 md:py-2.5 cursor-pointer hover:bg-muted/50 transition-colors",
              !isCompact && "md:py-4 md:px-5"
            )}
          >
            <CalendarRange className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5 hidden sm:block" />
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold tracking-wide block">Check in</span>
              <Input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="border-0 shadow-none h-7 px-0 text-sm focus-visible:ring-0"
              />
            </div>
          </label>
          <label
            className={cn(
              "flex-1 flex gap-2 px-4 py-3 md:py-2.5 cursor-pointer hover:bg-muted/50 transition-colors",
              !isCompact && "md:py-4 md:px-5"
            )}
          >
            <div className="min-w-0 flex-1 sm:pl-0">
              <span className="text-xs font-semibold tracking-wide block">Check out</span>
              <Input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="border-0 shadow-none h-7 px-0 text-sm focus-visible:ring-0"
              />
            </div>
          </label>
        </div>

        <label
          className={cn(
            "flex gap-3 px-4 py-3 md:py-2.5 cursor-text md:rounded-r-full hover:bg-muted/50 transition-colors flex items-center",
            !isCompact && "md:py-4 md:px-6 md:min-w-[140px]"
          )}
        >
          <Users className="h-5 w-5 text-muted-foreground shrink-0 hidden sm:block" />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold tracking-wide block">Who</span>
            <Input
              type="number"
              min={1}
              placeholder="Guests"
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className="border-0 shadow-none h-7 px-0 text-sm md:text-base focus-visible:ring-0"
            />
          </div>
        </label>

        <div
          className={cn(
            "p-2 flex items-center justify-center md:justify-end",
            isCompact ? "md:pr-2" : "md:pr-2"
          )}
        >
          <Button
            type="submit"
            size={isCompact ? "default" : "lg"}
            className={cn(
              "rounded-full w-full md:w-auto shadow-md",
              !isCompact && "px-8"
            )}
          >
            <Search className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Search</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
