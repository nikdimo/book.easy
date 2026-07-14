"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addPropertyType, togglePropertyTypeActive } from "@/lib/actions/property-type.actions";

interface PropertyTypeRow {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
}

export function PropertyTypesTab({ propertyTypes }: { propertyTypes: PropertyTypeRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  const active = propertyTypes.filter((p) => p.isActive);
  const hidden = propertyTypes.filter((p) => !p.isActive);

  function handleToggle(id: string) {
    startTransition(async () => {
      const result = await togglePropertyTypeActive(id);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function handleAdd() {
    startTransition(async () => {
      const result = await addPropertyType(newLabel);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`${newLabel.trim()} added`);
        setNewLabel("");
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Manage the property types hosts can pick from when listing a property.
        Hiding a type removes it from future pickers and search filters, but any
        listing already using it keeps it.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New property type name"
          className="sm:max-w-[280px]"
        />
        <Button disabled={isPending || newLabel.trim().length < 2} onClick={handleAdd}>
          Add property type
        </Button>
      </div>

      <div className="rounded-2xl border bg-gradient-to-b from-background to-muted/20 p-2 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)]">
        <div className="space-y-1">
          {active.map((propertyType) => (
            <PropertyTypeRowItem
              key={propertyType.id}
              propertyType={propertyType}
              isPending={isPending}
              onToggle={() => handleToggle(propertyType.id)}
            />
          ))}
          {active.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No active property types.
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
            {hidden.map((propertyType) => (
              <PropertyTypeRowItem
                key={propertyType.id}
                propertyType={propertyType}
                isPending={isPending}
                onToggle={() => handleToggle(propertyType.id)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PropertyTypeRowItem({
  propertyType,
  isPending,
  onToggle,
}: {
  propertyType: PropertyTypeRow;
  isPending: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[1.25rem] border border-border/60 bg-background/92 px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-3">
        <Checkbox checked={propertyType.isActive} disabled={isPending} onCheckedChange={onToggle} />
        <span className="text-sm font-medium">{propertyType.label}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        {propertyType.isActive ? "Active" : "Hidden"}
      </span>
    </div>
  );
}
