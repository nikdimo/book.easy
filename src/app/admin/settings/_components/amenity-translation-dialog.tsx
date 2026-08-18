"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fillAmenityTranslations,
  renameAmenity,
  renameAmenityCategory,
  setAmenityCategoryTranslation,
  setAmenityTranslation,
} from "@/lib/actions/amenity.actions";

export interface TranslationTargetLanguage {
  code: string;
  name: string;
  isDefault: boolean;
}

interface AmenityTranslationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "amenity" | "category";
  id: string;
  name: string;
  /** Existing overrides, keyed by locale. */
  translations: Record<string, string>;
  languages: TranslationTargetLanguage[];
}

/**
 * Renaming and translating in one place, because they are the same decision: the
 * English name is what guests see in English and what the reviewed AI catalog keys
 * its translations off, so changing it without looking at the other languages is how
 * a label ends up half-translated.
 */
export function AmenityTranslationDialog({
  open,
  onOpenChange,
  kind,
  id,
  name,
  translations,
  languages,
}: AmenityTranslationDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isFilling, setIsFilling] = useState(false);
  const [englishName, setEnglishName] = useState(name);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      languages
        .filter((language) => !language.isDefault)
        .map((language) => [language.code, translations[language.code] ?? ""]),
    ),
  );

  const targets = languages.filter((language) => !language.isDefault);

  function save() {
    startTransition(async () => {
      if (englishName.trim() !== name) {
        const renamed =
          kind === "amenity"
            ? await renameAmenity(id, englishName)
            : await renameAmenityCategory(id, englishName);
        if (renamed?.error) {
          toast.error(renamed.error);
          return;
        }
      }

      for (const language of targets) {
        const next = values[language.code] ?? "";
        if (next.trim() === (translations[language.code] ?? "")) continue;
        const result =
          kind === "amenity"
            ? await setAmenityTranslation(id, language.code, next)
            : await setAmenityCategoryTranslation(id, language.code, next);
        if ("error" in result) {
          toast.error(`${language.name}: ${result.error}`);
          return;
        }
      }

      toast.success("Labels saved");
      onOpenChange(false);
      router.refresh();
    });
  }

  function fillWithAi() {
    setIsFilling(true);
    void fillAmenityTranslations(id)
      .then((result) => {
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.success(
          "count" in result ? `Filled ${result.count} language(s)` : "Labels filled",
        );
        onOpenChange(false);
        router.refresh();
      })
      .finally(() => setIsFilling(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rename and translate</DialogTitle>
          <DialogDescription>
            A label left empty falls back to the reviewed AI translation for this
            catalog, and then to the English name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${id}`}>English name</Label>
            <Input
              id={`name-${id}`}
              value={englishName}
              onChange={(event) => setEnglishName(event.target.value)}
            />
          </div>

          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other languages are enabled.
            </p>
          ) : (
            <div className="space-y-2">
              {targets.map((language) => (
                <div
                  key={language.code}
                  className="grid grid-cols-[80px_1fr] items-center gap-2"
                >
                  <Label
                    htmlFor={`translation-${id}-${language.code}`}
                    className="text-xs text-muted-foreground"
                  >
                    {language.name}
                  </Label>
                  <Input
                    id={`translation-${id}-${language.code}`}
                    value={values[language.code] ?? ""}
                    placeholder="Falls back to the reviewed translation"
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [language.code]: event.target.value,
                      }))
                    }
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {kind === "amenity" ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending || isFilling}
              onClick={fillWithAi}
            >
              {isFilling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Fill with AI
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={isPending || isFilling}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
