"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addPropertyType,
  updatePropertyType,
} from "@/lib/actions/property-type.actions";
import { PropertyTypeIcon } from "@/components/shared/property-type-icon";
import {
  DEFAULT_PROPERTY_TYPE_ICON,
  PROPERTY_TYPE_ICONS,
} from "@/lib/property-type-icons";
import { cn } from "@/lib/utils";

interface PropertyTypeRow {
  id: string;
  value: string;
  label: string;
  icon: string;
  description: string;
  isActive: boolean;
}

interface EditorValues {
  label: string;
  description: string;
  icon: string;
  isActive: boolean;
}

const EMPTY_EDITOR: EditorValues = {
  label: "",
  description: "",
  icon: DEFAULT_PROPERTY_TYPE_ICON,
  isActive: true,
};

export function PropertyTypesTab({
  propertyTypes,
}: {
  propertyTypes: PropertyTypeRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editorMode, setEditorMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorValues>(EMPTY_EDITOR);

  const active = propertyTypes.filter((propertyType) => propertyType.isActive);
  const hidden = propertyTypes.filter((propertyType) => !propertyType.isActive);
  const canSave =
    editor.label.trim().length >= 2 &&
    editor.description.trim().length >= 10 &&
    editor.description.trim().length <= 240;

  function openAdd() {
    setEditingId(null);
    setEditor(EMPTY_EDITOR);
    setEditorMode("add");
  }

  function openEdit(propertyType: PropertyTypeRow) {
    setEditingId(propertyType.id);
    setEditor({
      label: propertyType.label,
      description: propertyType.description,
      icon: propertyType.icon,
      isActive: propertyType.isActive,
    });
    setEditorMode("edit");
  }

  function handleSave() {
    startTransition(async () => {
      const result =
        editorMode === "add"
          ? await addPropertyType(
              editor.label,
              editor.description,
              editor.icon
            )
          : editingId
            ? await updatePropertyType(
                editingId,
                editor.label,
                editor.description,
                editor.icon,
                editor.isActive
              )
            : { error: "Property type not found." };

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        editorMode === "add"
          ? `${editor.label.trim()} added`
          : `${editor.label.trim()} updated`
      );
      setEditorMode(null);
      router.refresh();
    });
  }

  return (
    <div className="max-w-5xl space-y-7">
      <div className="max-w-2xl space-y-1">
        <p className="text-sm text-muted-foreground">
          Manage the property types hosts can choose. Hover or focus a card to
          see its host-facing explanation, or select it to edit the icon and
          details.
        </p>
        <p className="text-xs text-muted-foreground">
          Hidden types stay valid for existing listings but disappear from new
          listing and search choices.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Active property types</h2>
          <p className="text-xs text-muted-foreground">
            These choices are currently available to hosts.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {active.map((propertyType) => (
            <PropertyTypeAdminCard
              key={propertyType.id}
              propertyType={propertyType}
              onClick={() => openEdit(propertyType)}
            />
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="group flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/3 px-3 py-4 text-center text-primary outline-none transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/7 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                onClick={openAdd}
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-105">
                  <Plus className="size-7" />
                </span>
                <span className="text-sm font-semibold">Add new</span>
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>
              Create another property type
            </TooltipContent>
          </Tooltip>
        </div>
      </section>

      {hidden.length > 0 && (
        <details className="rounded-2xl border border-dashed p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Hidden property types ({hidden.length})
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {hidden.map((propertyType) => (
              <PropertyTypeAdminCard
                key={propertyType.id}
                propertyType={propertyType}
                onClick={() => openEdit(propertyType)}
              />
            ))}
          </div>
        </details>
      )}

      <Dialog
        open={editorMode !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setEditorMode(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editorMode === "add"
                ? "Add property type"
                : "Edit property type"}
            </DialogTitle>
            <DialogDescription>
              Choose the icon and write the short explanation hosts will see
              when they hover over this choice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                {PROPERTY_TYPE_ICONS.map((icon) => (
                  <Tooltip key={icon.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={icon.label}
                        aria-pressed={editor.icon === icon.value}
                        className={cn(
                          "relative flex aspect-square items-center justify-center rounded-xl border outline-none transition-colors hover:border-primary/50 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40",
                          editor.icon === icon.value
                            ? "border-primary bg-primary/8 text-primary ring-1 ring-primary"
                            : "border-border text-muted-foreground"
                        )}
                        onClick={() =>
                          setEditor((current) => ({
                            ...current,
                            icon: icon.value,
                          }))
                        }
                      >
                        <PropertyTypeIcon
                          name={icon.value}
                          className="size-6"
                        />
                        {editor.icon === icon.value && (
                          <Check className="absolute right-1 top-1 size-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={6}>
                      {icon.label}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="property-type-name">Title</Label>
              <Input
                id="property-type-name"
                value={editor.label}
                maxLength={80}
                placeholder="e.g. Houseboat"
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="property-type-description">Explanation</Label>
                <span className="text-xs text-muted-foreground">
                  {editor.description.trim().length}/240
                </span>
              </div>
              <Textarea
                id="property-type-description"
                value={editor.description}
                maxLength={240}
                rows={3}
                placeholder="Explain what makes this property type different."
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                This text appears when a host hovers over or focuses the card.
              </p>
            </div>

            {editorMode === "edit" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                <Checkbox
                  checked={editor.isActive}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    setEditor((current) => ({
                      ...current,
                      isActive: checked === true,
                    }))
                  }
                />
                <span>
                  <span className="block text-sm font-medium">
                    Available to hosts
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Turn this off to hide the type from future listings and
                    search filters.
                  </span>
                </span>
              </label>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={isPending || !canSave}
              onClick={handleSave}
            >
              {isPending
                ? "Saving…"
                : editorMode === "add"
                  ? "Add property type"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PropertyTypeAdminCard({
  propertyType,
  onClick,
}: {
  propertyType: PropertyTypeRow;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border bg-background px-3 py-4 text-center shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
            !propertyType.isActive && "bg-muted/30 opacity-70"
          )}
          onClick={onClick}
        >
          <span className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-lg bg-background/85 text-muted-foreground opacity-70 shadow-sm ring-1 ring-border transition-colors group-hover:text-primary group-hover:opacity-100">
            <Pencil className="size-3.5" />
            <span className="sr-only">Edit {propertyType.label}</span>
          </span>
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            <PropertyTypeIcon name={propertyType.icon} className="size-7" />
          </span>
          <span className="text-sm font-semibold leading-tight">
            {propertyType.label}
          </span>
          {!propertyType.isActive && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Hidden
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent sideOffset={8} className="max-w-64 text-center">
        {propertyType.description}
      </TooltipContent>
    </Tooltip>
  );
}
