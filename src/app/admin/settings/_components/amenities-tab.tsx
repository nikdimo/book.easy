"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addAmenity, toggleAmenityActive } from "@/lib/actions/amenity.actions";
import { AMENITY_CATEGORIES } from "@/lib/constants";

interface AmenityRow {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
}

export function AmenitiesTab({ amenities }: { amenities: AmenityRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(AMENITY_CATEGORIES[0]);

  const grouped = useMemo(() => {
    const categories = new Map<string, AmenityRow[]>();
    for (const category of AMENITY_CATEGORIES) categories.set(category, []);
    for (const amenity of amenities) {
      if (!categories.has(amenity.category)) categories.set(amenity.category, []);
      categories.get(amenity.category)!.push(amenity);
    }
    return categories;
  }, [amenities]);

  function handleToggle(id: string) {
    startTransition(async () => {
      const result = await toggleAmenityActive(id);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function handleAdd() {
    startTransition(async () => {
      const result = await addAmenity(newName, newCategory);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`${newName.trim()} added`);
        setNewName("");
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <p className="text-sm text-muted-foreground">
        Manage the amenity catalog hosts can pick from when listing a property.
        Hiding an amenity removes it from future pickers and search filters, but any
        listing already using it keeps it.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New amenity name"
          className="sm:max-w-[240px]"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-[180px]"
        >
          {AMENITY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button disabled={isPending || newName.trim().length < 2} onClick={handleAdd}>
          Add amenity
        </Button>
      </div>

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([category, rows]) => {
          const active = rows.filter((r) => r.isActive);
          const hidden = rows.filter((r) => !r.isActive);
          if (active.length === 0 && hidden.length === 0) return null;

          return (
            <div key={category} className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {category}
              </p>
              <div className="rounded-2xl border bg-gradient-to-b from-background to-muted/20 p-2 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)]">
                <div className="space-y-1">
                  {active.map((amenity) => (
                    <AmenityRowItem
                      key={amenity.id}
                      amenity={amenity}
                      isPending={isPending}
                      onToggle={() => handleToggle(amenity.id)}
                    />
                  ))}
                  {active.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      No active amenities in this category.
                    </p>
                  )}
                </div>
              </div>

              {hidden.length > 0 && (
                <details className="rounded-xl border border-dashed px-4 py-2">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    Hidden ({hidden.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {hidden.map((amenity) => (
                      <AmenityRowItem
                        key={amenity.id}
                        amenity={amenity}
                        isPending={isPending}
                        onToggle={() => handleToggle(amenity.id)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AmenityRowItem({
  amenity,
  isPending,
  onToggle,
}: {
  amenity: AmenityRow;
  isPending: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[1.25rem] border border-border/60 bg-background/92 px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-3">
        <Checkbox checked={amenity.isActive} disabled={isPending} onCheckedChange={onToggle} />
        <span className="text-sm font-medium">{amenity.name}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        {amenity.isActive ? "Active" : "Hidden"}
      </span>
    </div>
  );
}
