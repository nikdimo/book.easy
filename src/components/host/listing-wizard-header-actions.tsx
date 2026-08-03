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
  showCounter = true,
  saveStatus,
  onOpenSteps,
  onLeave,
  onRetrySave,
}: {
  step: number;
  totalSteps: number;
  stepTitle: string;
  /** The optional screens after the last step are deliberately unnumbered — showing
   *  "11/10" there, or renumbering the wizard, would make it longer for every host
   *  including the ones who skip them. */
  showCounter?: boolean;
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
      {/* Fills the slot and centres, so the step indicator sits in the middle of
          the bar rather than crowding the language widget. */}
      <div className="flex w-full min-w-0 items-center justify-center gap-1 md:hidden">
        <button
          type="button"
          onClick={onLeave}
          aria-label={resolve("host.form.my_listings", "My listings").text}
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={onOpenSteps}
          className="inline-flex min-h-10 min-w-0 shrink items-center gap-2 rounded-full bg-muted px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/70"
        >
          <ListChecks className="size-4 shrink-0 text-primary" />
          {showCounter && (
            <span className="notranslate shrink-0 tabular-nums" translate="no">
              {`${step + 1}/${totalSteps}`}
            </span>
          )}
          <span className="truncate font-medium text-muted-foreground">
            {stepTitle}
          </span>
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
