"use client";

import { ArrowLeft, ListChecks } from "lucide-react";
import { HostHeaderPortal } from "@/components/host/host-header-portal";
import { useI18n } from "@/lib/i18n/client";

export type ListingSaveStatus = "saving" | "saved" | "error";

/**
 * The wizard used to carry its own 118px title bar on phones. Everything worth
 * keeping from it — leave, jump to a step, and whether the draft is safe — fits
 * in the shell header next to the language widget, which already collapses on
 * scroll. That buys the form back a fifth of the viewport.
 */
export function ListingWizardHeaderActions({
  step,
  totalSteps,
  stepTitle,
  saveStatus,
  onOpenSteps,
  onLeave,
  onRetrySave,
}: {
  step: number;
  totalSteps: number;
  stepTitle: string;
  saveStatus: ListingSaveStatus;
  onOpenSteps: () => void;
  onLeave: () => void;
  onRetrySave: () => void;
}) {
  const { resolve } = useI18n();

  const saveLabel =
    saveStatus === "saving"
      ? resolve("host.form.saving", "Saving…").text
      : saveStatus === "error"
        ? resolve("host.form.save_failed", "Save failed").text
        : resolve("host.form.draft_saved", "Draft saved").text;

  return (
    <HostHeaderPortal>
      <div className="flex min-w-0 items-center gap-1 md:hidden">
        <button
          type="button"
          onClick={onLeave}
          aria-label={resolve("host.form.my_listings", "My listings").text}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={onOpenSteps}
          className="inline-flex min-w-0 min-h-9 shrink items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ListChecks className="size-3.5 shrink-0" />
          <span className="notranslate shrink-0" translate="no">
            {`${step + 1}/${totalSteps}`}
          </span>
          <span className="truncate">{stepTitle}</span>
        </button>
        {/* A dot rather than a word: the wording still reaches screen readers,
            but on a 375px bar "Draft saved" crowded out the step title. */}
        <button
          type="button"
          onClick={saveStatus === "error" ? onRetrySave : undefined}
          disabled={saveStatus !== "error"}
          aria-label={
            saveStatus === "error"
              ? resolve("host.form.retry", "Retry").text
              : saveLabel
          }
          className="grid size-6 shrink-0 place-items-center rounded-full disabled:pointer-events-none"
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full transition-colors ${
              saveStatus === "error"
                ? "bg-destructive"
                : saveStatus === "saving"
                  ? "bg-muted-foreground/50"
                  : "bg-transparent"
            }`}
          />
        </button>
        <span className="sr-only" aria-live="polite">
          {saveLabel}
        </span>
      </div>
    </HostHeaderPortal>
  );
}
