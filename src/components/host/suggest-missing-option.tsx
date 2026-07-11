"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSuggestion } from "@/lib/actions/suggestion.actions";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";

interface SuggestMissingOptionProps {
  kind: "PROPERTY_TYPE" | "AMENITY";
  listingId?: string;
  label: string;
  placeholder: string;
}

export function SuggestMissingOption({
  kind,
  listingId,
  label,
  placeholder,
}: SuggestMissingOptionProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (value.trim().length < 2) return;
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("label", value.trim());
    if (listingId) formData.set("listingId", listingId);

    startTransition(async () => {
      const result = await createSuggestion(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Thanks — an admin will review it soon.");
        setValue("");
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        <Lightbulb className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-9 max-w-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending || value.trim().length < 2}
        onClick={submit}
      >
        Send
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
