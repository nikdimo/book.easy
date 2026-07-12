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
import { GripVertical, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  addLanguage,
  removeLanguage,
  reorderLanguageList,
  toggleLanguageEnabled,
} from "@/lib/actions/language.actions";
import {
  getLanguageSearchText,
  LANGUAGE_CATALOG,
  normalizeLanguageSearch,
} from "@/lib/constants/languages";
import { cn } from "@/lib/utils";

interface LanguageRow {
  code: string;
  name: string;
  isDefault: boolean;
  isEnabled: boolean;
  sortOrder: number;
}

export function LanguagesTab({ languages }: { languages: LanguageRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orderedLanguages, setOrderedLanguages] = useState(languages);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
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

  function handleRemove(code: string) {
    startTransition(async () => {
      const result = await removeLanguage(code);
      if (result?.error) toast.error(result.error);
      else router.refresh();
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
                    onRemove={() => handleRemove(language.code)}
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
    </div>
  );
}

function SortableLanguageRow({
  language,
  isPending,
  onToggle,
  onRemove,
}: {
  language: LanguageRow;
  isPending: boolean;
  onToggle: () => void;
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
