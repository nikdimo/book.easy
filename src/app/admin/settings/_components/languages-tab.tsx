"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addLanguage,
  removeLanguage,
  reorderLanguageList,
  toggleLanguageAiTranslation,
  toggleLanguageEnabled,
} from "@/lib/actions/language.actions";
import { runTranslationSync } from "@/lib/actions/ui-translation.actions";
import {
  getLanguageSearchText,
  LANGUAGE_CATALOG,
  normalizeLanguageSearch,
} from "@/lib/constants/languages";
import type { TranslationStatus } from "@/lib/services/ui-translation.service";
import { cn } from "@/lib/utils";
import { TranslationReviewDialog } from "./translation-review-dialog";

interface LanguageRow {
  code: string;
  name: string;
  isDefault: boolean;
  isEnabled: boolean;
  sortOrder: number;
  useAiTranslation: boolean;
}

export function LanguagesTab({
  languages,
  translationStatus,
}: {
  languages: LanguageRow[];
  translationStatus: TranslationStatus[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSyncing, startSyncTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orderedLanguages, setOrderedLanguages] = useState(languages);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  /** Language awaiting destructive-removal confirmation. Removal cascades to every
   * stored translation for that locale, including manual reviews, so it must never
   * happen on a single click. */
  const [pendingRemoval, setPendingRemoval] = useState<LanguageRow | null>(null);
  const deferredQuery = useDeferredValue(query);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const availableToAdd = useMemo(() => {
    const existingCodes = new Set(orderedLanguages.map((language) => language.code));
    const normalizedQuery = normalizeLanguageSearch(deferredQuery);

    return LANGUAGE_CATALOG.filter((language) => {
      if (existingCodes.has(language.code)) return false;
      if (!normalizedQuery) return true;
      return getLanguageSearchText(language).includes(normalizedQuery);
    });
  }, [deferredQuery, orderedLanguages]);

  const activeLanguage =
    orderedLanguages.find((language) => language.code === activeId) ?? null;

  function handleToggle(code: string) {
    startTransition(async () => {
      const result = await toggleLanguageEnabled(code);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function handleToggleAi(code: string) {
    startTransition(async () => {
      const result = await toggleLanguageAiTranslation(code);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function handleSync() {
    startSyncTransition(async () => {
      const result = await runTranslationSync();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const translatedCount = result.results.reduce((sum, r) => sum + r.translated, 0);
      toast.success(
        translatedCount > 0
          ? `Scanned ${result.found} strings, translated ${translatedCount}`
          : `Scanned ${result.found} strings — everything already up to date`
      );
      router.refresh();
    });
  }

  function handleRemove(code: string) {
    startTransition(async () => {
      const result = await removeLanguage(code);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Language removed");
        setPendingRemoval(null);
        router.refresh();
      }
    });
  }

  function handleAdd(code: string, name: string) {
    startTransition(async () => {
      const result = await addLanguage(code, name);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`${name} added`);
        setPickerOpen(false);
        setQuery("");
        router.refresh();
      }
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const fromIndex = orderedLanguages.findIndex((language) => language.code === active.id);
    const toIndex = orderedLanguages.findIndex((language) => language.code === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = arrayMove(orderedLanguages, fromIndex, toIndex).map((language, index) => ({
      ...language,
      sortOrder: index,
    }));

    setOrderedLanguages(next);
    startTransition(async () => {
      const result = await reorderLanguageList(next.map((language) => language.code));
      if (result?.error) {
        toast.error(result.error);
        setOrderedLanguages(languages);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Choose which languages visitors can translate the site into. Visitors pick a
        language from the dropdown in the header, and changes here apply immediately.
      </p>

      <p className="text-sm text-muted-foreground">
        Search by English name, native name, or common spelling. Try Romanian,
        Romana, Romana with accents, Macedonian, Makedonski, or Македонски.
      </p>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Drag to reorder
        </p>

        <DndContext
          id="languages-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext
            items={orderedLanguages.map((language) => language.code)}
            strategy={verticalListSortingStrategy}
          >
            <div className="rounded-2xl border bg-gradient-to-b from-background to-muted/20 p-2 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)]">
              <div className="space-y-2">
                {orderedLanguages.map((language) => (
                  <SortableLanguageRow
                    key={language.code}
                    language={language}
                    isPending={isPending}
                    onToggle={() => handleToggle(language.code)}
                    onToggleAi={() => handleToggleAi(language.code)}
                    onRemove={() => setPendingRemoval(language)}
                  />
                ))}
              </div>
            </div>
          </SortableContext>

          <DragOverlay>
            {activeLanguage ? (
              <LanguageDragPreview language={activeLanguage} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="space-y-3 rounded-2xl border bg-gradient-to-b from-background to-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Translation status</p>
            <p className="text-xs text-muted-foreground">
              &ldquo;AI translate&rdquo; languages get real Claude-translated fixed
              text; anything missing or stale still falls back to Google Translate.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="shrink-0 gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
            Sync now
          </Button>
        </div>

        <div className="space-y-1.5">
          {translationStatus.map((status) => (
            <div
              key={status.code}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{status.name}</span>
                {!status.useAiTranslation && (
                  <Badge variant="secondary" className="shrink-0">
                    Google Translate only
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {status.useAiTranslation && status.total > 0 && (
                  <span>
                    {status.translated}/{status.total} translated
                    {status.stale > 0 && `, ${status.stale} stale`}
                    {status.manuallyEdited > 0 && `, ${status.manuallyEdited} manual`}
                  </span>
                )}
                <span>{status.selectionCount} picks</span>
                {status.useAiTranslation ? (
                  <TranslationReviewDialog locale={status.code} languageName={status.name} />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {availableToAdd.length > 0 ? (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start sm:w-[380px]"
              disabled={isPending}
            >
              <Search className="mr-2 h-4 w-4" />
              Search and add a language
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-[380px] p-0">
            <Command shouldFilter={false}>
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Type Romanian, Romana, Romana with accents..."
              />
              <CommandList>
                <CommandEmpty>No matching language found.</CommandEmpty>
                <CommandGroup>
                  {availableToAdd.map((language) => (
                    <CommandItem
                      key={language.code}
                      value={`${language.code} ${language.name} ${language.englishName}`}
                      onSelect={() => handleAdd(language.code, language.name)}
                      disabled={isPending}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{language.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {language.englishName}
                          </div>
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {language.code}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="text-sm text-muted-foreground">
          All available languages from the current catalog have already been added.
        </div>
      )}

      <RemoveLanguageDialog
        language={pendingRemoval}
        status={
          pendingRemoval
            ? translationStatus.find((entry) => entry.code === pendingRemoval.code) ?? null
            : null
        }
        isPending={isPending}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => pendingRemoval && handleRemove(pendingRemoval.code)}
      />
    </div>
  );
}

/** Destructive-removal confirmation. Deleting a Language cascades to every
 * UiTranslation row for that locale (see the FK in schema.prisma), so reviewed and
 * manually edited translations are lost permanently — the counts are shown so the
 * admin can see exactly what is at stake before confirming. */
function RemoveLanguageDialog({
  language,
  status,
  isPending,
  onCancel,
  onConfirm,
}: {
  language: LanguageRow | null;
  status: TranslationStatus | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const storedTranslations = status ? status.translated + status.stale : 0;
  const manualReviews = status?.manuallyEdited ?? 0;

  return (
    <Dialog open={Boolean(language)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {language?.name}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                This permanently deletes every stored translation for this language.
                It cannot be undone, and re-adding the language later starts from an
                empty catalog.
              </p>
              {storedTranslations > 0 ? (
                <p className="font-medium text-foreground">
                  {storedTranslations} stored translation
                  {storedTranslations === 1 ? "" : "s"} will be deleted
                  {manualReviews > 0
                    ? `, including ${manualReviews} manual review${manualReviews === 1 ? "" : "s"}`
                    : ""}
                  .
                </p>
              ) : (
                <p className="text-muted-foreground">
                  This language has no stored translations yet.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {manualReviews > 0 ? "Delete language and reviews" : "Delete language"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableLanguageRow({
  language,
  isPending,
  onToggle,
  onToggleAi,
  onRemove,
}: {
  language: LanguageRow;
  isPending: boolean;
  onToggle: () => void;
  onToggleAi: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: language.code });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition:
          transition ?? "transform 260ms cubic-bezier(0.2, 0.9, 0.2, 1), box-shadow 220ms ease",
      }}
      className={cn(
        "flex items-center justify-between rounded-[1.25rem] border border-border/60 bg-background/92 px-4 py-3 shadow-sm ring-1 ring-transparent backdrop-blur transition-[box-shadow,transform,border-color,background-color]",
        isDragging && "z-20 scale-[1.03] border-primary/30 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.5)] ring-primary/15"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${language.name}`}
          className="inline-flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-full border border-border/70 bg-muted/50 text-muted-foreground transition-transform hover:scale-105 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Checkbox
          checked={language.isEnabled}
          disabled={language.isDefault || isPending}
          onCheckedChange={onToggle}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{language.name}</div>
          {language.isDefault && (
            <div className="text-xs text-muted-foreground">
              default, always on
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {!language.isDefault && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={language.useAiTranslation}
              disabled={isPending}
              onCheckedChange={onToggleAi}
            />
            AI translate
          </label>
        )}
        {!language.isDefault && (
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={onRemove}
            className="rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function LanguageDragPreview({ language }: { language: LanguageRow }) {
  return (
    <div className="flex w-[calc(100vw-2rem)] max-w-[380px] items-center justify-between rounded-[1.25rem] border border-primary/25 bg-background/95 px-4 py-3 shadow-[0_30px_80px_-24px_rgba(15,23,42,0.58)] backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-muted/60 text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <Checkbox checked={language.isEnabled} disabled />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{language.name}</div>
          {language.isDefault && (
            <div className="text-xs text-muted-foreground">default, always on</div>
          )}
        </div>
      </div>
      {!language.isDefault && (
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground">
          <X className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
