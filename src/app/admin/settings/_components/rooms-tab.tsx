"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AmenityIconPicker } from "./amenity-icon-picker";
import { SpaceIcon } from "@/components/shared/space-icon";
import {
  addRoomType,
  addRoomTypeCategory,
  deleteRoomType,
  deleteRoomTypeCategory,
  renameRoomTypeCategory,
  toggleRoomTypeActive,
  toggleRoomTypeCategoryActive,
  updateRoomType,
} from "@/lib/actions/room-type.actions";
import { cn } from "@/lib/utils";

interface CategoryRow {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { roomTypes: number };
}

interface RoomTypeRow {
  id: string;
  key: string;
  name: string;
  categoryId: string;
  icon: string | null;
  sortOrder: number;
  isRepeatable: boolean;
  isStandard: boolean;
  isActive: boolean;
  _count: { rooms: number };
}

interface RoomEditor {
  name: string;
  icon: string | null;
  categoryId: string;
  isRepeatable: boolean;
  isStandard: boolean;
}

/**
 * The room and space taxonomy hosts pick from when they organise their photos.
 *
 * Same shape as the amenities tab — grouped rows, an icon picker, hide rather than
 * delete for anything in use — because it is the same job: a marketplace vocabulary an
 * admin owns, that reaches production through the release snapshot rather than a deploy.
 */
export function RoomsTab({
  categories,
  roomTypes,
}: {
  categories: CategoryRow[];
  roomTypes: RoomTypeRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [roomEditor, setRoomEditor] = useState<RoomEditor | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [groupEditor, setGroupEditor] = useState<{ name: string; icon: string | null } | null>(
    null,
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const byCategory = useMemo(() => {
    const map = new Map<string, RoomTypeRow[]>();
    for (const category of categories) map.set(category.id, []);
    for (const roomType of roomTypes) {
      if (!roomType.isActive && !showHidden) continue;
      map.get(roomType.categoryId)?.push(roomType);
    }
    return map;
  }, [categories, roomTypes, showHidden]);

  const hiddenCount = roomTypes.filter((roomType) => !roomType.isActive).length;

  function run(work: () => Promise<{ error?: string } | undefined>, done: string) {
    startTransition(async () => {
      const result = await work();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      setRoomEditor(null);
      setGroupEditor(null);
      router.refresh();
    });
  }

  function openAddRoom(categoryId: string) {
    setEditingRoomId(null);
    setRoomEditor({
      name: "",
      icon: null,
      categoryId,
      isRepeatable: true,
      isStandard: false,
    });
  }

  function openEditRoom(roomType: RoomTypeRow) {
    setEditingRoomId(roomType.id);
    setRoomEditor({
      name: roomType.name,
      icon: roomType.icon,
      categoryId: roomType.categoryId,
      isRepeatable: roomType.isRepeatable,
      isStandard: roomType.isStandard,
    });
  }

  return (
    <div className="max-w-5xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm text-muted-foreground">
            The spaces hosts can create when organising a listing&rsquo;s photos. Grouped
            the way the host-facing picker groups them.
          </p>
          <p className="text-xs text-muted-foreground">
            Hidden spaces stay valid for listings already using them but disappear from the
            picker. Run{" "}
            <code className="rounded bg-muted px-1 py-0.5">npm run rooms:export</code> to
            carry changes made here to production on the next deploy.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHidden((current) => !current)}
            >
              {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingGroupId(null);
              setGroupEditor({ name: "", icon: null });
            }}
          >
            <Plus className="size-4" />
            Add group
          </Button>
        </div>
      </div>

      {categories.map((category) => {
        const rows = byCategory.get(category.id) ?? [];
        return (
          <section key={category.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <SpaceIcon name={category.icon} className="size-4" />
              </span>
              <h2 className={cn("font-semibold", !category.isActive && "text-muted-foreground")}>
                {category.name}
              </h2>
              <span className="text-xs text-muted-foreground">
                {category._count.roomTypes}
              </span>
              {!category.isActive && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Hidden
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingGroupId(category.id);
                    setGroupEditor({ name: category.name, icon: category.icon });
                  }}
                >
                  <Pencil className="size-3.5" />
                  <span className="sr-only">Edit {category.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () => toggleRoomTypeCategoryActive(category.id),
                      category.isActive ? `${category.name} hidden` : `${category.name} shown`,
                    )
                  }
                >
                  {category.isActive ? (
                    <Eye className="size-3.5" />
                  ) : (
                    <EyeOff className="size-3.5" />
                  )}
                  <span className="sr-only">
                    {category.isActive ? "Hide" : "Show"} {category.name}
                  </span>
                </Button>
                {category._count.roomTypes === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => deleteRoomTypeCategory(category.id),
                        `${category.name} deleted`,
                      )
                    }
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                    <span className="sr-only">Delete {category.name}</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {rows.map((roomType) => {
                return (
                  <div
                    key={roomType.id}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-xl border bg-background p-2.5",
                      !roomType.isActive && "bg-muted/30 opacity-70",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <SpaceIcon name={roomType.icon} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {roomType.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {roomType.isStandard ? "Standard" : roomType.isRepeatable ? "Repeatable" : "One per listing"}
                        {roomType._count.rooms > 0 ? ` · ${roomType._count.rooms} in use` : ""}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0"
                        onClick={() => openEditRoom(roomType)}
                      >
                        <Pencil className="size-3.5" />
                        <span className="sr-only">Edit {roomType.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0"
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => toggleRoomTypeActive(roomType.id),
                            roomType.isActive
                              ? `${roomType.name} hidden`
                              : `${roomType.name} shown`,
                          )
                        }
                      >
                        {roomType.isActive ? (
                          <Eye className="size-3.5" />
                        ) : (
                          <EyeOff className="size-3.5" />
                        )}
                        <span className="sr-only">
                          {roomType.isActive ? "Hide" : "Show"} {roomType.name}
                        </span>
                      </Button>
                      {roomType._count.rooms === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0"
                          disabled={isPending}
                          onClick={() =>
                            run(() => deleteRoomType(roomType.id), `${roomType.name} deleted`)
                          }
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                          <span className="sr-only">Delete {roomType.name}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => openAddRoom(category.id)}
                className="flex min-h-[3.75rem] items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
              >
                <Plus className="size-4" />
                Add space
              </button>
            </div>
          </section>
        );
      })}

      <Dialog
        open={roomEditor !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setRoomEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoomId ? "Edit space" : "Add space"}</DialogTitle>
            <DialogDescription>
              Hosts see this name when they add a room and when they organise photos.
            </DialogDescription>
          </DialogHeader>

          {roomEditor && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="room-type-name">Name</Label>
                <div className="flex gap-2">
                  <AmenityIconPicker
                    name={roomEditor.name || "Space"}
                    value={roomEditor.icon}
                    onSelect={(icon) =>
                      setRoomEditor((current) => (current ? { ...current, icon } : current))
                    }
                  >
                    <Button type="button" variant="outline" className="size-9 shrink-0 p-0">
                      <SpaceIcon
                        name={roomEditor.icon}
                        className={roomEditor.icon ? "size-4" : "size-4 text-muted-foreground"}
                      />
                      <span className="sr-only">Choose icon</span>
                    </Button>
                  </AmenityIconPicker>
                  <Input
                    id="room-type-name"
                    value={roomEditor.name}
                    maxLength={60}
                    placeholder="Wine cellar"
                    onChange={(event) =>
                      setRoomEditor((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Group</Label>
                <Select
                  value={roomEditor.categoryId}
                  onValueChange={(categoryId) =>
                    setRoomEditor((current) => (current ? { ...current, categoryId } : current))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                <Checkbox
                  checked={roomEditor.isRepeatable}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    setRoomEditor((current) =>
                      current ? { ...current, isRepeatable: checked === true } : current,
                    )
                  }
                />
                <span>
                  <span className="block text-sm font-medium">
                    A property can have several
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Numbers them for the host — Bedroom 1, Bedroom 2. Leave off for spaces
                    that only ever exist once, like Exterior.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                <Checkbox
                  checked={roomEditor.isStandard}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    setRoomEditor((current) =>
                      current ? { ...current, isStandard: checked === true } : current,
                    )
                  }
                />
                <span>
                  <span className="block text-sm font-medium">Suggest on every listing</span>
                  <span className="block text-xs text-muted-foreground">
                    Appears greyed out in the host&rsquo;s rooms panel before they create
                    anything, and becomes real when they drop a photo on it. Keep this to a
                    handful — it is the first thing a host sees.
                  </span>
                </span>
              </label>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={isPending || (roomEditor?.name.trim().length ?? 0) < 2}
              onClick={() => {
                if (!roomEditor) return;
                const label = roomEditor.name.trim();
                run(
                  () =>
                    editingRoomId
                      ? updateRoomType(
                          editingRoomId,
                          label,
                          roomEditor.icon,
                          roomEditor.isRepeatable,
                          roomEditor.categoryId,
                          roomEditor.isStandard,
                        )
                      : addRoomType(
                          label,
                          roomEditor.categoryId,
                          roomEditor.icon ?? undefined,
                          roomEditor.isRepeatable,
                          roomEditor.isStandard,
                        ),
                  editingRoomId ? `${label} updated` : `${label} added`,
                );
              }}
            >
              {isPending ? "Saving…" : editingRoomId ? "Save changes" : "Add space"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={groupEditor !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setGroupEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroupId ? "Edit group" : "Add group"}</DialogTitle>
            <DialogDescription>
              Groups organise the picker hosts choose a space from.
            </DialogDescription>
          </DialogHeader>

          {groupEditor && (
            <div className="space-y-2">
              <Label htmlFor="room-group-name">Name</Label>
              <div className="flex gap-2">
                <AmenityIconPicker
                  name={groupEditor.name || "Group"}
                  value={groupEditor.icon}
                  onSelect={(icon) =>
                    setGroupEditor((current) => (current ? { ...current, icon } : current))
                  }
                >
                  <Button type="button" variant="outline" className="size-9 shrink-0 p-0">
                    <SpaceIcon
                      name={groupEditor.icon}
                      className={groupEditor.icon ? "size-4" : "size-4 text-muted-foreground"}
                    />
                    <span className="sr-only">Choose icon</span>
                  </Button>
                </AmenityIconPicker>
                <Input
                  id="room-group-name"
                  value={groupEditor.name}
                  maxLength={60}
                  placeholder="Wellness"
                  onChange={(event) =>
                    setGroupEditor((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={isPending || (groupEditor?.name.trim().length ?? 0) < 2}
              onClick={() => {
                if (!groupEditor) return;
                const label = groupEditor.name.trim();
                run(
                  () =>
                    editingGroupId
                      ? renameRoomTypeCategory(editingGroupId, label, groupEditor.icon)
                      : addRoomTypeCategory(label, groupEditor.icon ?? undefined),
                  editingGroupId ? `${label} updated` : `${label} added`,
                );
              }}
            >
              {isPending ? "Saving…" : editingGroupId ? "Save changes" : "Add group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
