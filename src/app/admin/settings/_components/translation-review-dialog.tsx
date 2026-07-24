"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  loadTranslationEntries,
  saveTranslationOverride,
} from "@/lib/actions/ui-translation.actions";

interface ReviewEntry {
  key: string;
  sourceText: string;
  filePath: string | null;
  value: string;
  stale: boolean;
  isManuallyEdited: boolean;
}

export function TranslationReviewDialog({ locale, languageName }: { locale: string; languageName: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!open) return;
    startLoading(async () => {
      const result = await loadTranslationEntries(locale);
      if (!result.success) toast.error(result.error);
      else setEntries(result.entries);
    });
  }, [locale, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Review</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Review {languageName} translations</DialogTitle>
          <DialogDescription>
            Correct AI wording here. Manual edits are preserved until the English source text changes.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {loading ? <p className="text-sm text-muted-foreground">Loading translations…</p> : null}
          {!loading && entries.map((entry) => (
            <TranslationReviewRow key={entry.key} locale={locale} entry={entry} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TranslationReviewRow({ locale, entry }: { locale: string; entry: ReviewEntry }) {
  const [value, setValue] = useState(entry.value);
  const [savedValue, setSavedValue] = useState(entry.value);
  const [manuallyEdited, setManuallyEdited] = useState(entry.isManuallyEdited);
  const [saving, startSaving] = useTransition();
  const changed = value.trim() !== savedValue;

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs font-medium">{entry.key}</code>
        {entry.stale ? <Badge variant="destructive">Stale</Badge> : null}
        {manuallyEdited ? <Badge variant="secondary">Manual</Badge> : null}
        {!entry.value ? <Badge variant="outline">Missing</Badge> : null}
      </div>
      <p className="text-xs text-muted-foreground">English: {entry.sourceText}</p>
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Enter translation"
        rows={2}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[11px] text-muted-foreground">{entry.filePath}</span>
        <Button
          size="sm"
          disabled={!changed || saving || !value.trim()}
          onClick={() => startSaving(async () => {
            const result = await saveTranslationOverride(locale, entry.key, value);
            if (!result.success) toast.error(result.error);
            else {
              toast.success("Translation saved");
              setSavedValue(value.trim());
              setManuallyEdited(true);
            }
          })}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
