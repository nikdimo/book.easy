"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ListItem = {
  id: string;
  searchText: string;
  filters?: Record<string, string>;
  sortValues?: Record<string, string | number>;
  content: ReactNode;
};

export type ListFilter = {
  key: string;
  label: string;
  allLabel?: string;
  options: { value: string; label: string }[];
};

export type ListSort = { value: string; label: string; direction?: "asc" | "desc" };

export function ListControls({
  items,
  filters = [],
  sorts,
  searchPlaceholder = "Search all fields…",
  emptyMessage = "No results match your search and filters.",
  className = "space-y-3",
}: {
  items: ListItem[];
  filters?: ListFilter[];
  sorts: ListSort[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(sorts[0]?.value ?? "");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleItems = useMemo(() => {
    const selectedSort = sorts.find((option) => option.value === sort) ?? sorts[0];
    return items
      .filter((item) => {
        if (normalizedQuery && !item.searchText.toLocaleLowerCase().includes(normalizedQuery)) return false;
        return filters.every(({ key }) => {
          const selected = activeFilters[key];
          return !selected || item.filters?.[key] === selected;
        });
      })
      .sort((a, b) => {
        if (!selectedSort) return 0;
        const av = a.sortValues?.[selectedSort.value] ?? "";
        const bv = b.sortValues?.[selectedSort.value] ?? "";
        const comparison = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
        return selectedSort.direction === "desc" ? -comparison : comparison;
      });
  }, [activeFilters, filters, items, normalizedQuery, sort, sorts]);

  const hasCriteria = Boolean(normalizedQuery || Object.values(activeFilters).some(Boolean));
  const clear = () => { setQuery(""); setActiveFilters({}); };

  return (
    <div>
      <div className="mb-5 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="pl-3 pr-10" aria-label={searchPlaceholder} />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search"><X className="h-4 w-4" /></button>
            ) : (
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          {filters.map((filter) => (
            <Select key={filter.key} value={activeFilters[filter.key] || "all"} onValueChange={(value) => setActiveFilters((current) => ({ ...current, [filter.key]: value === "all" ? "" : value }))}>
              <SelectTrigger className="w-full lg:w-[170px]" aria-label={filter.label}><SlidersHorizontal className="mr-2 h-4 w-4" /><SelectValue placeholder={filter.label} /></SelectTrigger>
              <SelectContent><SelectItem value="all">{filter.allLabel ?? `All ${filter.label.toLowerCase()}`}</SelectItem>{filter.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full lg:w-[190px]" aria-label="Sort results"><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>{sorts.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-sm text-muted-foreground" aria-live="polite">
          <span>{visibleItems.length} of {items.length} results</span>
          {hasCriteria && <Button type="button" variant="ghost" size="sm" onClick={clear} className="h-7">Clear filters</Button>}
        </div>
      </div>
      {visibleItems.length ? <div className={className}>{visibleItems.map((item) => <div key={item.id}>{item.content}</div>)}</div> : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>}
    </div>
  );
}
