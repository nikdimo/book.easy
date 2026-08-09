"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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

export function ListingCurrencyPicker({
  currencies,
  value,
  invalid,
  onChange,
}: {
  currencies: string[];
  value: string;
  invalid?: boolean;
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
              k="host.form.pricing.choose_currency_description"
              source="Search by currency name, code, symbol, or country."
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
