"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AMENITY_ICON_GROUPS,
  amenityIcon,
  suggestAmenityIcons,
} from "@/lib/amenities/icon-registry";
import { cn } from "@/lib/utils";

interface AmenityIconPickerProps {
  /** The amenity or category name, used to rank the suggestion row. */
  name: string;
  value: string | null;
  onSelect: (icon: string | null) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * The catalog offers a curated set rather than every lucide icon: a closed list keeps
 * the grid coherent, makes the picker fast without virtualization, and lets the stored
 * icon be validated instead of failing silently at render time.
 */
export function AmenityIconPicker({
  name,
  value,
  onSelect,
  disabled,
  children,
}: AmenityIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const suggestions = useMemo(() => suggestAmenityIcons(name), [name]);

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return AMENITY_ICON_GROUPS;
    return AMENITY_ICON_GROUPS.map((group) => ({
      group: group.group,
      icons: group.icons.filter(
        (icon) =>
          icon.key.includes(term) ||
          icon.label.toLowerCase().includes(term) ||
          group.group.toLowerCase().includes(term),
      ),
    })).filter((group) => group.icons.length > 0);
  }, [query]);

  function choose(icon: string | null) {
    onSelect(icon);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search icons…"
            className="h-8"
          />
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {suggestions.length > 0 && !query.trim() && (
            <IconGroup
              label={`Suggested for “${name}”`}
              icons={suggestions.map((key) => ({ key, label: key }))}
              value={value}
              onSelect={choose}
            />
          )}

          {groups.map((group) => (
            <IconGroup
              key={group.group}
              label={group.group}
              icons={group.icons}
              value={value}
              onSelect={choose}
            />
          ))}

          {groups.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No icon matches “{query}”.
            </p>
          )}
        </div>

        {value && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => choose(null)}
            >
              Remove icon
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function IconGroup({
  label,
  icons,
  value,
  onSelect,
}: {
  label: string;
  icons: { key: string; label: string }[];
  value: string | null;
  onSelect: (icon: string) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 px-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="grid grid-cols-8 gap-1">
        {icons.map((icon) => {
          const Icon = amenityIcon(icon.key);
          if (!Icon) return null;
          return (
            <button
              key={`${label}-${icon.key}`}
              type="button"
              title={icon.label}
              aria-label={icon.label}
              aria-pressed={value === icon.key}
              onClick={() => onSelect(icon.key)}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors",
                value === icon.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
