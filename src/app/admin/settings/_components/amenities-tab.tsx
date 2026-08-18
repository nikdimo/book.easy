"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CircleAlert,
  EyeOff,
  Languages,
  Loader2,
  Merge,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addAmenity,
  addAmenityCategory,
  deleteAmenity,
  deleteAmenityCategory,
  mergeAmenities,
  moveAmenitiesToCategory,
  reorderAmenities,
  saveAmenityAlias,
  setAmenitiesActive,
  setAmenityCategoryIcon,
  setAmenityIcon,
  toggleAmenityActive,
  toggleAmenityCategoryActive,
} from "@/lib/actions/amenity.actions";
import { renderAmenityIcon } from "@/lib/amenities/icon-registry";
import { cn } from "@/lib/utils";
import { AmenityIconPicker } from "./amenity-icon-picker";
import {
  AmenityTranslationDialog,
  type TranslationTargetLanguage,
} from "./amenity-translation-dialog";

interface TranslationRow {
  locale: string;
  label: string;
}

interface AmenityRow {
  id: string;
  key: string;
  name: string;
  categoryId: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  translations: TranslationRow[];
  aliases: { id: string; provider: string; providerName: string }[];
  _count: { listings: number };
}

interface CategoryRow {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  translations: TranslationRow[];
  _count: { amenities: number };
}

interface AmenitiesTabProps {
  categories: CategoryRow[];
  amenities: AmenityRow[];
  languages: TranslationTargetLanguage[];
}

/** Hovering over the middle of a card has to be deliberate before it turns into a
 *  merge, or reordering past a neighbour would keep offering to destroy it. */
const MERGE_DWELL_MS = 550;

/** English needs no override: the name itself is the English label. */
function missingTranslation(
  row: { translations: TranslationRow[] },
  locale: string,
): boolean {
  if (locale === "en") return false;
  return !row.translations.some((translation) => translation.locale === locale);
}

export function AmenitiesTab({
  categories,
  amenities,
  languages,
}: AmenitiesTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [previewLocale, setPreviewLocale] = useState("en");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellCandidate = useRef<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState(categories[0]?.id ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [aliasProvider, setAliasProvider] = useState("AIRBNB");
  const [aliasName, setAliasName] = useState("");
  const [aliasTargetId, setAliasTargetId] = useState(amenities[0]?.id ?? "");

  const [editing, setEditing] = useState<
    | { kind: "amenity" | "category"; id: string; name: string; translations: Record<string, string> }
    | null
  >(null);
  const [mergeConfirm, setMergeConfirm] = useState<
    { source: AmenityRow; target: AmenityRow } | null
  >(null);

  const amenityById = useMemo(
    () => new Map(amenities.map((amenity) => [amenity.id, amenity])),
    [amenities],
  );

  const localeLabel = useMemo(() => {
    if (previewLocale === "en") return null;
    return languages.find((language) => language.code === previewLocale)?.name ?? null;
  }, [languages, previewLocale]);

  /** What a host would see for this row in the previewed language — the English name
   *  when there is no override, which is exactly the gap worth showing. */
  function displayLabel(row: { name: string; translations: TranslationRow[] }) {
    if (previewLocale === "en") return row.name;
    return (
      row.translations.find((translation) => translation.locale === previewLocale)
        ?.label ?? row.name
    );
  }

  const isUntranslated = (row: { translations: TranslationRow[] }) =>
    missingTranslation(row, previewLocale);

  const grouped = useMemo(() => {
    const term = query.trim().toLowerCase();
    return categories.map((category) => ({
      category,
      items: amenities
        .filter((amenity) => amenity.categoryId === category.id)
        .filter((amenity) => (showHidden ? true : amenity.isActive))
        .filter(
          (amenity) =>
            !term ||
            amenity.name.toLowerCase().includes(term) ||
            amenity.key.includes(term) ||
            amenity.aliases.some((alias) =>
              alias.providerName.toLowerCase().includes(term),
            ),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    }));
  }, [amenities, categories, query, showHidden]);

  const health = useMemo(() => {
    const active = amenities.filter((amenity) => amenity.isActive);
    return {
      total: active.length,
      hidden: amenities.length - active.length,
      withoutIcon: active.filter((amenity) => !amenity.icon).length,
      untranslated: active.filter((amenity) =>
        missingTranslation(amenity, previewLocale),
      ).length,
      inFallback: active.filter(
        (amenity) =>
          categories.find((category) => category.id === amenity.categoryId)?.key ===
          "features",
      ).length,
    };
  }, [amenities, categories, previewLocale]);

  const sensors = useSensors(
    // A small movement threshold keeps plain clicks (select, open a menu) working.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function run(action: () => Promise<{ error?: string } | void>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  function clearDwell() {
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    dwellTimer.current = null;
    dwellCandidate.current = null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : null;
    const activeIdentifier = String(event.active.id);

    // Only a card can be merged into, and only a different one.
    const overIsCard = overId ? amenityById.has(overId) : false;
    if (!overId || !overIsCard || overId === activeIdentifier) {
      clearDwell();
      setMergeTargetId(null);
      return;
    }
    if (dwellCandidate.current === overId) return;

    clearDwell();
    dwellCandidate.current = overId;
    dwellTimer.current = setTimeout(() => setMergeTargetId(overId), MERGE_DWELL_MS);
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const pendingMerge = mergeTargetId;

    clearDwell();
    setActiveId(null);
    setMergeTargetId(null);

    if (!overId) return;

    const dragged = amenityById.get(draggedId);
    if (!dragged) return;

    // Held over another card long enough: ask before folding one row into another,
    // because it moves live listings and deletes the source.
    if (pendingMerge && pendingMerge === overId) {
      const target = amenityById.get(pendingMerge);
      if (target) setMergeConfirm({ source: dragged, target });
      return;
    }

    const targetCategoryId = overId.startsWith("category:")
      ? overId.slice("category:".length)
      : amenityById.get(overId)?.categoryId;
    if (!targetCategoryId) return;

    const group = grouped.find((entry) => entry.category.id === targetCategoryId);
    if (!group) return;

    const withoutDragged = group.items.filter((item) => item.id !== draggedId);
    const overIndex = withoutDragged.findIndex((item) => item.id === overId);
    const nextOrder = [...withoutDragged];
    nextOrder.splice(overIndex < 0 ? withoutDragged.length : overIndex, 0, dragged);

    const unchanged =
      dragged.categoryId === targetCategoryId &&
      group.items.length === nextOrder.length &&
      group.items.every((item, index) => item.id === nextOrder[index]?.id);
    if (unchanged) return;

    run(
      () =>
        reorderAmenities(
          targetCategoryId,
          nextOrder.map((item) => item.id),
        ),
      dragged.categoryId === targetCategoryId
        ? undefined
        : `${dragged.name} moved to ${
            categories.find((category) => category.id === targetCategoryId)?.name ?? ""
          }`,
    );
  }

  function toggleSelection(id: string, event: React.MouseEvent) {
    const flat = grouped.flatMap((group) => group.items.map((item) => item.id));
    if (event.shiftKey && lastClickedId) {
      const from = flat.indexOf(lastClickedId);
      const to = flat.indexOf(id);
      if (from >= 0 && to >= 0) {
        const range = flat.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelectedIds((current) => [...new Set([...current, ...range])]);
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((current) =>
        current.includes(id)
          ? current.filter((entry) => entry !== id)
          : [...current, id],
      );
      setLastClickedId(id);
      return;
    }
    setSelectedIds((current) =>
      current.length === 1 && current[0] === id ? [] : [id],
    );
    setLastClickedId(id);
  }

  const activeAmenity = activeId ? amenityById.get(activeId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          This is the picker hosts see. Click an icon to change it, click a name to
          rename and translate it, drag a card to reorder or move it to another group,
          and hold one card over another to merge duplicates. Hiding an amenity removes
          it from future pickers and search filters; any listing already using it keeps
          it.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={previewLocale}
            onChange={(event) => setPreviewLocale(event.target.value)}
            className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm"
            aria-label="Preview language"
          >
            <option value="en">English</option>
            {languages
              .filter((language) => !language.isDefault)
              .map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{health.total} amenities</span>
        {health.hidden > 0 && <span>· {health.hidden} hidden</span>}
        {health.withoutIcon > 0 && (
          <span className="text-amber-600 dark:text-amber-500">
            · {health.withoutIcon} without an icon
          </span>
        )}
        {localeLabel && health.untranslated > 0 && (
          <span className="text-amber-600 dark:text-amber-500">
            · {health.untranslated} untranslated in {localeLabel}
          </span>
        )}
        {health.inFallback > 0 && (
          <span className="text-amber-600 dark:text-amber-500">
            · {health.inFallback} still in Features
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            className="h-8 w-40"
          />
          <Button
            variant={showHidden ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowHidden((current) => !current)}
          >
            <EyeOff className="size-3.5" />
            {showHidden ? "Hiding shown" : "Show hidden"}
          </Button>
        </div>
      </div>

      <DndContext
        id="amenity-catalog-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          clearDwell();
          setActiveId(null);
          setMergeTargetId(null);
        }}
      >
        <div className="space-y-6">
          {grouped.map(({ category, items }) => (
            <CategorySection
              key={category.id}
              category={category}
              items={items}
              isPending={isPending}
              selectedIds={selectedIds}
              mergeTargetId={mergeTargetId}
              displayLabel={displayLabel}
              isUntranslated={isUntranslated}
              onSelect={toggleSelection}
              onEditCategory={() =>
                setEditing({
                  kind: "category",
                  id: category.id,
                  name: category.name,
                  translations: Object.fromEntries(
                    category.translations.map((row) => [row.locale, row.label]),
                  ),
                })
              }
              onCategoryIcon={(icon) =>
                run(() => setAmenityCategoryIcon(category.id, icon))
              }
              onToggleCategory={() =>
                run(
                  () => toggleAmenityCategoryActive(category.id),
                  category.isActive ? `${category.name} hidden` : `${category.name} shown`,
                )
              }
              onDeleteCategory={() =>
                run(() => deleteAmenityCategory(category.id), `${category.name} deleted`)
              }
              onEditAmenity={(amenity) =>
                setEditing({
                  kind: "amenity",
                  id: amenity.id,
                  name: amenity.name,
                  translations: Object.fromEntries(
                    amenity.translations.map((row) => [row.locale, row.label]),
                  ),
                })
              }
              onAmenityIcon={(amenity, icon) =>
                run(() => setAmenityIcon(amenity.id, icon))
              }
              onToggleAmenity={(amenity) =>
                run(
                  () => toggleAmenityActive(amenity.id),
                  amenity.isActive ? `${amenity.name} hidden` : `${amenity.name} shown`,
                )
              }
              onDeleteAmenity={(amenity) =>
                run(() => deleteAmenity(amenity.id), `${amenity.name} deleted`)
              }
              onMoveAmenity={(amenity, categoryId) =>
                run(
                  () => moveAmenitiesToCategory([amenity.id], categoryId),
                  `${amenity.name} moved`,
                )
              }
              onMergeAmenity={(source, target) => setMergeConfirm({ source, target })}
              categories={categories}
              amenities={amenities}
            />
          ))}
        </div>

        <DragOverlay>
          {activeAmenity ? (
            <div className="pointer-events-none flex items-center gap-2 rounded-xl border-2 border-primary bg-card px-3 py-2.5 shadow-xl">
              <AmenityGlyph icon={activeAmenity.icon} />
              <span className="text-[0.8125rem] font-medium">
                {displayLabel(activeAmenity)}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="px-1 text-sm font-medium">
            {selectedIds.length} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" disabled={isPending}>
                Move to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category.id}
                  onSelect={() =>
                    run(() => {
                      const ids = selectedIds;
                      setSelectedIds([]);
                      return moveAmenitiesToCategory(ids, category.id);
                    }, `Moved to ${category.name}`)
                  }
                >
                  {category.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              run(() => {
                const ids = selectedIds;
                setSelectedIds([]);
                return setAmenitiesActive(ids, false);
              }, "Hidden")
            }
          >
            Hide
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Clear
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold">Add to the catalog</p>
            <p className="text-xs text-muted-foreground">
              New rows land at the end of their group — drag them where they belong.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New amenity name"
            />
            <select
              value={newCategoryId}
              onChange={(event) => setNewCategoryId(event.target.value)}
              className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm sm:w-[180px]"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <Button
              disabled={isPending || newName.trim().length < 2 || !newCategoryId}
              onClick={() =>
                run(() => {
                  const name = newName.trim();
                  setNewName("");
                  return addAmenity(name, newCategoryId);
                }, "Amenity added")
              }
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="New category name"
            />
            <Button
              variant="secondary"
              disabled={isPending || newCategoryName.trim().length < 2}
              onClick={() =>
                run(() => {
                  const name = newCategoryName.trim();
                  setNewCategoryName("");
                  return addAmenityCategory(name);
                }, "Category added")
              }
            >
              <Plus className="size-4" />
              Add group
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold">Provider amenity mapping</p>
            <p className="text-xs text-muted-foreground">
              Map a provider label once and all future imports will use the selected
              Linger amenity.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
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
              className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2"
            >
              {amenities.map((amenity) => (
                <option key={amenity.id} value={amenity.id}>
                  {amenity.name}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              className="sm:col-span-2"
              disabled={isPending || aliasName.trim().length < 2 || !aliasTargetId}
              onClick={() =>
                run(() => {
                  const name = aliasName;
                  setAliasName("");
                  return saveAmenityAlias(aliasProvider, name, aliasTargetId);
                }, "Mapping saved for future imports")
              }
            >
              Save mapping
            </Button>
          </div>
        </div>
      </div>

      {editing && (
        <AmenityTranslationDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          kind={editing.kind}
          id={editing.id}
          name={editing.name}
          translations={editing.translations}
          languages={languages}
        />
      )}

      <Dialog
        open={Boolean(mergeConfirm)}
        onOpenChange={(open) => !open && setMergeConfirm(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge duplicates</DialogTitle>
            <DialogDescription>
              {mergeConfirm && (
                <>
                  <span className="font-medium text-foreground">
                    {mergeConfirm.source.name}
                  </span>{" "}
                  will be deleted.{" "}
                  {mergeConfirm.source._count.listings > 0 ? (
                    <>
                      Its{" "}
                      <span className="font-medium text-foreground">
                        {mergeConfirm.source._count.listings} listing
                        {mergeConfirm.source._count.listings === 1 ? "" : "s"}
                      </span>{" "}
                      and every provider mapping will move to{" "}
                    </>
                  ) : (
                    <>No listing uses it. Its provider mappings will move to </>
                  )}
                  <span className="font-medium text-foreground">
                    {mergeConfirm.target.name}
                  </span>
                  .
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setMergeConfirm(null)}>
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                if (!mergeConfirm) return;
                const { source, target } = mergeConfirm;
                setMergeConfirm(null);
                run(
                  () => mergeAmenities(source.id, target.id, aliasProvider),
                  `${source.name} merged into ${target.name}`,
                );
              }}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AmenityGlyph({ icon, missing }: { icon: string | null; missing?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
        missing
          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {renderAmenityIcon(icon, "size-[1.125rem]") ?? (
        <Sparkles className="size-[1.125rem]" />
      )}
    </span>
  );
}

function CategorySection({
  category,
  items,
  isPending,
  selectedIds,
  mergeTargetId,
  displayLabel,
  isUntranslated,
  onSelect,
  onEditCategory,
  onCategoryIcon,
  onToggleCategory,
  onDeleteCategory,
  onEditAmenity,
  onAmenityIcon,
  onToggleAmenity,
  onDeleteAmenity,
  onMoveAmenity,
  onMergeAmenity,
  categories,
  amenities,
}: {
  category: CategoryRow;
  items: AmenityRow[];
  isPending: boolean;
  selectedIds: string[];
  mergeTargetId: string | null;
  displayLabel: (row: { name: string; translations: TranslationRow[] }) => string;
  isUntranslated: (row: { translations: TranslationRow[] }) => boolean;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onEditCategory: () => void;
  onCategoryIcon: (icon: string | null) => void;
  onToggleCategory: () => void;
  onDeleteCategory: () => void;
  onEditAmenity: (amenity: AmenityRow) => void;
  onAmenityIcon: (amenity: AmenityRow, icon: string | null) => void;
  onToggleAmenity: (amenity: AmenityRow) => void;
  onDeleteAmenity: (amenity: AmenityRow) => void;
  onMoveAmenity: (amenity: AmenityRow, categoryId: string) => void;
  onMergeAmenity: (source: AmenityRow, target: AmenityRow) => void;
  categories: CategoryRow[];
  amenities: AmenityRow[];
}) {
  // Dropping on the group itself (its header or its empty space) moves a card here
  // without having to aim between two existing cards.
  const { setNodeRef, isOver } = useDroppable({ id: `category:${category.id}` });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-2xl border p-3 transition-colors",
        isOver ? "border-primary bg-primary/[0.04]" : "border-transparent",
        !category.isActive && "opacity-60",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <AmenityIconPicker
          name={category.name}
          value={category.icon}
          onSelect={onCategoryIcon}
          disabled={isPending}
        >
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Change the ${category.name} icon`}
          >
            {renderAmenityIcon(category.icon, "size-4") ?? (
              <Sparkles className="size-4" />
            )}
          </button>
        </AmenityIconPicker>

        <button
          type="button"
          onClick={onEditCategory}
          className="rounded px-1 text-sm font-semibold hover:underline"
        >
          {displayLabel(category)}
        </button>
        <span className="text-xs text-muted-foreground">({items.length})</span>
        {!category.isActive && (
          <Badge variant="secondary" className="text-[0.65rem]">
            Hidden
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs">
              Group
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEditCategory}>
              <Pencil className="size-3.5" />
              Rename &amp; translate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleCategory}>
              <EyeOff className="size-3.5" />
              {category.isActive ? "Hide group" : "Show group"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={category._count.amenities > 0}
              onSelect={onDeleteCategory}
            >
              <Trash2 className="size-3.5" />
              {category._count.amenities > 0
                ? `Holds ${category._count.amenities}`
                : "Delete group"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SortableContext
        items={items.map((item) => item.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2.5">
          {items.map((amenity) => (
            <AmenityCard
              key={amenity.id}
              amenity={amenity}
              isPending={isPending}
              isSelected={selectedIds.includes(amenity.id)}
              isMergeTarget={mergeTargetId === amenity.id}
              label={displayLabel(amenity)}
              untranslated={isUntranslated(amenity)}
              onSelect={onSelect}
              onEdit={() => onEditAmenity(amenity)}
              onIcon={(icon) => onAmenityIcon(amenity, icon)}
              onToggle={() => onToggleAmenity(amenity)}
              onDelete={() => onDeleteAmenity(amenity)}
              onMove={(categoryId) => onMoveAmenity(amenity, categoryId)}
              onMerge={(targetId) => {
                const target = amenities.find((entry) => entry.id === targetId);
                if (target) onMergeAmenity(amenity, target);
              }}
              categories={categories}
              amenities={amenities}
            />
          ))}
          {items.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              Empty — drop an amenity here.
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function AmenityCard({
  amenity,
  isPending,
  isSelected,
  isMergeTarget,
  label,
  untranslated,
  onSelect,
  onEdit,
  onIcon,
  onToggle,
  onDelete,
  onMove,
  onMerge,
  categories,
  amenities,
}: {
  amenity: AmenityRow;
  isPending: boolean;
  isSelected: boolean;
  isMergeTarget: boolean;
  label: string;
  untranslated: boolean;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onEdit: () => void;
  onIcon: (icon: string | null) => void;
  onToggle: () => void;
  onDelete: () => void;
  onMove: (categoryId: string) => void;
  onMerge: (targetId: string) => void;
  categories: CategoryRow[];
  amenities: AmenityRow[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: amenity.id });

  const inUse = amenity._count.listings > 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex min-h-[64px] items-center gap-2.5 rounded-xl border py-2.5 pl-3 pr-8 text-left transition-all",
        isDragging && "opacity-40",
        isMergeTarget
          ? "scale-[1.04] border-primary bg-primary/10 ring-2 ring-primary"
          : isSelected
            ? "border-primary bg-primary/[0.08] ring-1 ring-primary/20"
            : "border-border/70 bg-card hover:border-primary/40 hover:shadow-sm",
        !amenity.isActive && "opacity-55",
      )}
      onClick={(event) => onSelect(amenity.id, event)}
      {...attributes}
      {...listeners}
    >
      {isMergeTarget && (
        <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-medium text-primary-foreground">
          <Merge className="mr-1 inline size-2.5" />
          Merge into {amenity.name}
        </span>
      )}

      {/* Stops the drag sensor from swallowing the click that opens the picker. */}
      <span
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <AmenityIconPicker
          name={amenity.name}
          value={amenity.icon}
          onSelect={onIcon}
          disabled={isPending}
        >
          <button
            type="button"
            aria-label={`Change the ${amenity.name} icon`}
            className="cursor-pointer"
          >
            <AmenityGlyph icon={amenity.icon} missing={!amenity.icon} />
          </button>
        </AmenityIconPicker>
      </span>

      <span className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="block w-full break-words text-left text-[0.8125rem] font-medium leading-snug hover:underline"
        >
          {label}
        </button>
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[0.65rem] text-muted-foreground">
          {inUse && <span>{amenity._count.listings} listings</span>}
          {untranslated && (
            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-500">
              <CircleAlert className="size-2.5" />
              no label
            </span>
          )}
          {!amenity.isActive && <span>hidden</span>}
        </span>
      </span>

      <span
        className="absolute right-1 top-1"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-6 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Actions for ${amenity.name}`}
            >
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onEdit}>
              <Languages className="size-3.5" />
              Rename &amp; translate
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Pencil className="size-3.5" />
                Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {categories.map((category) => (
                  <DropdownMenuItem
                    key={category.id}
                    disabled={category.id === amenity.categoryId}
                    onSelect={() => onMove(category.id)}
                  >
                    {category.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Merge className="size-3.5" />
                Merge into
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {amenities
                  .filter((candidate) => candidate.id !== amenity.id)
                  .map((candidate) => (
                    <DropdownMenuItem
                      key={candidate.id}
                      onSelect={() => onMerge(candidate.id)}
                    >
                      {candidate.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onToggle}>
              <EyeOff className="size-3.5" />
              {amenity.isActive ? "Hide" : "Show"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={inUse}
              onSelect={onDelete}
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
            {inUse && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[0.65rem] font-normal text-muted-foreground">
                  Used by {amenity._count.listings} listing
                  {amenity._count.listings === 1 ? "" : "s"}, so deleting would strip it
                  from them. Hide it or merge it instead.
                </DropdownMenuLabel>
              </>
            )}
            {amenity.aliases.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[0.65rem] font-normal text-muted-foreground">
                  {amenity.aliases
                    .map((alias) => `${alias.provider}: ${alias.providerName}`)
                    .join(" · ")}
                </DropdownMenuLabel>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
