"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  addAmenity,
  mergeAmenities,
  saveAmenityAlias,
  toggleAmenityActive,
} from "@/lib/actions/amenity.actions";
import { AMENITY_CATEGORIES } from "@/lib/constants";

interface AmenityRow {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  aliases: { id: string; provider: string; providerName: string }[];
}

export function AmenitiesTab({ amenities }: { amenities: AmenityRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(AMENITY_CATEGORIES[0]);
  const [aliasProvider, setAliasProvider] = useState("AIRBNB");
  const [aliasName, setAliasName] = useState("");
  const [aliasTargetId, setAliasTargetId] = useState(amenities[0]?.id ?? "");

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

  function handleAlias() {
    startTransition(async () => {
      const result = await saveAmenityAlias(aliasProvider, aliasName, aliasTargetId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Amenity mapping saved for future imports");
        setAliasName("");
        router.refresh();
      }
    });
  }

  function handleMerge(sourceId: string, targetId: string) {
    const source = amenities.find((amenity) => amenity.id === sourceId);
    const target = amenities.find((amenity) => amenity.id === targetId);
    if (!source || !target || !window.confirm(
      `Merge "${source.name}" into "${target.name}"? Existing listings and aliases will move to "${target.name}".`,
    )) return;
    startTransition(async () => {
      const result = await mergeAmenities(sourceId, targetId, aliasProvider);
      if (result?.error) toast.error(result.error);
      else if ("sourceName" in result && result.sourceName && result.targetName) {
        toast.success(`${result.sourceName} merged into ${result.targetName}`);
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

      <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
        <div>
          <p className="text-sm font-semibold">Provider amenity mapping</p>
          <p className="text-xs text-muted-foreground">
            Map a provider label once and all future imports will use the selected Linger amenity.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[130px_1fr_1fr_auto]">
          <select
            value={aliasProvider}
            onChange={(event) => setAliasProvider(event.target.value)}
            className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="AIRBNB">Airbnb</option>
            <option value="BOOKING">Booking.com</option>
            <option value="VRBO">Vrbo</option>
          </select>
          <Input
            value={aliasName}
            onChange={(event) => setAliasName(event.target.value)}
            placeholder='Provider name, e.g. "Smoke alarm"'
          />
          <select
            value={aliasTargetId}
            onChange={(event) => setAliasTargetId(event.target.value)}
            className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {amenities.map((amenity) => (
              <option key={amenity.id} value={amenity.id}>{amenity.name}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={isPending || aliasName.trim().length < 2 || !aliasTargetId}
            onClick={handleAlias}
          >
            Save mapping
          </Button>
        </div>
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
                      amenities={amenities}
                      onMerge={(targetId) => handleMerge(amenity.id, targetId)}
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
                        amenities={amenities}
                        onMerge={(targetId) => handleMerge(amenity.id, targetId)}
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
  amenities,
  onMerge,
}: {
  amenity: AmenityRow;
  isPending: boolean;
  onToggle: () => void;
  amenities: AmenityRow[];
  onMerge: (targetId: string) => void;
}) {
  const [mergeTargetId, setMergeTargetId] = useState("");
  return (
    <div className="rounded-[1.25rem] border border-border/60 bg-background/92 px-4 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={amenity.isActive} disabled={isPending} onCheckedChange={onToggle} />
          <span className="text-sm font-medium">{amenity.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {amenity.isActive ? "Active" : "Hidden"}
        </span>
      </div>
      {amenity.aliases.length > 0 && (
        <p className="mt-1 pl-7 text-xs text-muted-foreground">
          {amenity.aliases.map((alias) => `${alias.provider}: ${alias.providerName}`).join(" · ")}
        </p>
      )}
      <div className="mt-2 flex gap-2 pl-7">
        <select
          aria-label={`Merge ${amenity.name} into`}
          value={mergeTargetId}
          onChange={(event) => setMergeTargetId(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs"
        >
          <option value="">Merge duplicate into…</option>
          {amenities.filter((candidate) => candidate.id !== amenity.id).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !mergeTargetId}
          onClick={() => onMerge(mergeTargetId)}
        >
          Merge
        </Button>
      </div>
    </div>
  );
}
