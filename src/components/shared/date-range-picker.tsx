"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  disabledDates?: Date[];
  className?: string;
  placeholder?: string;
}

export function DateRangePicker({
  value,
  onChange,
  disabledDates = [],
  className,
  placeholder = "Select dates",
}: DateRangePickerProps) {
  const disabledMatcher = React.useMemo(() => {
    const matchers: Array<Date | { before: Date }> = [
      { before: new Date() },
      ...disabledDates,
    ];
    return matchers;
  }, [disabledDates]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, "MMM d")} – {format(value.to, "MMM d, yyyy")}
              </>
            ) : (
              format(value.from, "MMM d, yyyy")
            )
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          disabled={disabledMatcher}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
