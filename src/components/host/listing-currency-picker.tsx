"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CurrencyPickerPanel } from "@/components/shared/currency-picker-panel";
import { Tx, useI18n } from "@/lib/i18n/client";
import { currencyDisplayName, currencySymbol } from "@/lib/currency/currencies";

/** `field` is the original full-width form control. `header` is the strip that caps
 *  the pricing card: the currency is a once-per-listing decision, so it earns a line
 *  above the rates rather than the ~150px field row that used to push Nightly rate
 *  below the fold. Both triggers open the same dialog, which now carries the payout
 *  explanation the hint paragraph used to. */
export function ListingCurrencyPicker({
  currencies,
  value,
  invalid,
  variant = "field",
  onChange,
}: {
  currencies: string[];
  value: string;
  invalid?: boolean;
  variant?: "field" | "header";
  onChange: (code: string) => void;
}) {
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  const validValue = currencies.includes(value) ? value : undefined;

  function select(code: string) {
    onChange(code);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "header" ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4">
          <DialogTrigger asChild>
            <button
              type="button"
              className="-mx-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            >
              <Tx k="host.form.pricing.prices_in" source="Prices in" />
              <HelpCircle className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">
                {" — "}
                <Tx
                  k="host.form.pricing.about_currency"
                  source="about the listing currency"
                />
              </span>
            </button>
          </DialogTrigger>
          <DialogTrigger asChild>
            <Button
              id="currency"
              type="button"
              variant="outline"
              aria-invalid={invalid || undefined}
              className="h-auto min-h-9 shrink-0 gap-1.5 rounded-full border-input bg-card px-3 py-1 text-sm font-medium shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:text-destructive"
            >
              {validValue ? (
                <span className="notranslate">
                  {validValue} {currencySymbol(validValue, i18n.locale)}
                </span>
              ) : (
                <span className="font-normal text-muted-foreground">
                  <Tx
                    k="host.form.pricing.currency_placeholder"
                    source="Choose a currency"
                  />
                </span>
              )}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Button>
          </DialogTrigger>
        </div>
      ) : (
        <DialogTrigger asChild>
          <Button
            id="currency"
            type="button"
            variant="outline"
            aria-invalid={invalid || undefined}
            className="h-auto min-h-13 w-full justify-between rounded-xl border-input bg-card px-4 py-2.5 text-left text-base font-normal shadow-xs hover:bg-card focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
          >
            <span className="min-w-0">
              {validValue ? (
                <>
                  <span className="block truncate font-medium text-foreground">
                    {currencyDisplayName(validValue, i18n.locale)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {validValue} – {currencySymbol(validValue, i18n.locale)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  <Tx k="host.form.pricing.currency_placeholder" source="Choose a currency" />
                </span>
              )}
            </span>
            <ChevronDown className="ml-3 h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </DialogTrigger>
      )}

      <DialogContent
        variant="sheet"
        className="notranslate flex h-[82dvh] max-h-[46rem] flex-col gap-4 overflow-hidden pt-7 md:w-[calc(100vw-3rem)] md:max-w-3xl md:rounded-2xl md:pt-6"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>
            <Tx k="host.form.pricing.choose_currency_title" source="Choose the listing currency" />
          </DialogTitle>
          <DialogDescription>
            <Tx
              k="host.form.pricing.official_currency_hint"
              source="Your rates, bookings, payouts, and contractual totals use this currency. Guests may view an approximate conversion in their own currency."
            />
          </DialogDescription>
        </DialogHeader>

        <CurrencyPickerPanel
          currencies={currencies}
          currentCurrency={validValue}
          suggestedCurrency={validValue}
          onSelect={select}
          suggestedHeading={
            <Tx k="host.form.pricing.selected_currency" source="Selected currency" />
          }
        />
      </DialogContent>
    </Dialog>
  );
}
