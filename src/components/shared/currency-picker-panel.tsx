"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  currencyDisplayName,
  currencySearchText,
  currencySymbol,
} from "@/lib/currency/currencies";
import { tokenContainmentScore } from "@/lib/utils/search-score";
import { cn } from "@/lib/utils";

interface CurrencyRow {
  code: string;
  title: string;
  subtitle: string;
  searchText: string;
}

function CurrencyGrid({
  items,
  currentCurrency,
  onSelect,
}: {
  items: CurrencyRow[];
  currentCurrency?: string;
  onSelect: (code: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="px-1 py-8 text-sm text-muted-foreground">
        <Tx k="regional.no_currencies" source="No currencies found" />
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-2 gap-y-0.5 min-[30rem]:grid-cols-2 md:grid-cols-3">
      {items.map((row) => {
        const selected = row.code === currentCurrency;
        return (
          <button
            key={row.code}
            type="button"
            onClick={() => onSelect(row.code)}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
              "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-foreground" : "border-transparent",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-5">{row.title}</span>
              <span className="block truncate text-xs leading-4 text-muted-foreground">
                {row.subtitle}
              </span>
            </span>
            {selected && <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

export function CurrencyPickerPanel({
  currencies,
  currentCurrency,
  suggestedCurrency,
  onSelect,
  suggestedHeading,
}: {
  currencies: string[];
  currentCurrency?: string;
  suggestedCurrency?: string | null;
  onSelect: (code: string) => void;
  suggestedHeading?: React.ReactNode;
}) {
  const i18n = useI18n();
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      currencies.map((code) => ({
        code,
        title: currencyDisplayName(code, i18n.locale),
        subtitle: `${code} – ${currencySymbol(code, i18n.locale)}`,
        searchText: currencySearchText(code, i18n.locale),
      })),
    [currencies, i18n.locale],
  );
  const filtered = useMemo(
    () => rows.filter((row) => tokenContainmentScore(row.searchText, query) === 1),
    [query, rows],
  );
  const suggested = rows.filter((row) => row.code === suggestedCurrency);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={i18n.resolve("regional.search_currencies", "Search currencies").text}
          aria-label={
            i18n.resolve("regional.search_currencies_label", "Search currencies").text
          }
          className="pr-10"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {query === "" && suggested.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 px-1 text-sm font-medium">
              {suggestedHeading ?? (
                <Tx k="regional.suggested_currencies" source="Suggested currencies" />
              )}
            </h3>
            <CurrencyGrid
              items={suggested}
              currentCurrency={currentCurrency}
              onSelect={onSelect}
            />
          </section>
        )}

        <section>
          {query === "" && (
            <h3 className="mb-2 px-1 text-sm font-medium">
              <Tx k="regional.all_currencies" source="Choose a currency" />
            </h3>
          )}
          <CurrencyGrid
            items={filtered}
            currentCurrency={currentCurrency}
            onSelect={onSelect}
          />
        </section>
      </div>
    </div>
  );
}
