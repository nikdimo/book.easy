"use client";

import { ArrowRight, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
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
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import type { ReviewPlan } from "@/lib/host/v2/calendar-review";
import {
  consequenceText,
  publishBlockerText,
  reviewErrorText,
  reviewFieldLabel,
  reviewValueText,
  saveActionLabel,
} from "./calendar-labels";

/**
 * The step between editing and saving.
 *
 * It exists to make the host read the change back in the guest's terms — what the
 * value is now, what it becomes, and what happens the moment it is saved — before
 * anything is written. The final button always names the action; "Confirm" would
 * describe nothing.
 */
export function ReviewDialog({
  open,
  plan,
  scopeLabel,
  currency,
  formats,
  pending,
  note,
  onNoteChange,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  plan: ReviewPlan;
  /** Which dates, or which listing, this change is about. */
  scopeLabel: string;
  currency: string;
  formats: CalendarFormats;
  pending: boolean;
  /**
   * The private block note being reviewed, or null when this review is not a block.
   * Editable here so the last thing the host reads before saving is also the last
   * thing they can correct, without stepping back into the editor and losing the run.
   */
  note: string | null;
  onNoteChange: (note: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const i18n = useI18n();
  const title = i18n.resolve("host.v2.calendar.review.title", "Review changes");
  const save = saveActionLabel(i18n, plan.saveAction);
  const cancel = i18n.resolve("host.v2.calendar.review.cancel", "Back to editing");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="sheet"
        className="md:max-w-lg"
        {...anchorProps(CALENDAR_ANCHOR.reviewDialog)}
      >
        <DialogHeader>
          <DialogTitle className={title.translated ? "notranslate" : undefined}>
            {title.text}
          </DialogTitle>
          <DialogDescription>{scopeLabel}</DialogDescription>
        </DialogHeader>

        {plan.errors.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {plan.errors.map((error) => {
              const text = reviewErrorText(i18n, error);
              return (
                <li
                  key={error.code}
                  className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className={text.translated ? "notranslate" : undefined}>
                      {text.text}
                    </span>
                    {/* Publish is refused for a list of concrete reasons, so the
                        host is given the list rather than one flat refusal. */}
                    {error.code === "CANNOT_PUBLISH" ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {error.blockers.map((blocker) => (
                          <li key={blocker}>
                            {publishBlockerText(i18n, blocker).text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {plan.rows.length > 0 ? (
          <dl className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
            {plan.rows.map((row) => {
              const field = reviewFieldLabel(i18n, row.field);
              const before = reviewValueText(i18n, row.before, currency, formats);
              const after = reviewValueText(i18n, row.after, currency, formats);
              return (
                <div key={row.field} className="px-3 py-2.5">
                  <dt
                    className={cn(
                      "text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400",
                      field.translated && "notranslate",
                    )}
                  >
                    {field.text}
                  </dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span
                      className={cn(
                        "text-slate-500 line-through decoration-slate-300",
                        before.translated && "notranslate",
                      )}
                    >
                      {before.text}
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span
                      className={cn(
                        "font-semibold text-slate-900",
                        after.translated && "notranslate",
                      )}
                    >
                      {after.text}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        {note !== null ? (
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="host-v2-review-block-note"
              className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400"
            >
              {i18n.resolve("host.v2.calendar.field.block_note", "Private note").text}
            </Label>
            <Input
              id="host-v2-review-block-note"
              value={note}
              maxLength={200}
              disabled={pending}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={
                i18n.resolve(
                  "host.v2.calendar.block_note_placeholder",
                  "e.g. Maintenance or private stay",
                ).text
              }
            />
            <p className="text-[0.75rem] leading-4 text-slate-500">
              {
                i18n.resolve(
                  "host.v2.calendar.block_note_hint",
                  "Only you can see this note.",
                ).text
              }
            </p>
          </div>
        ) : null}

        {plan.consequences.length > 0 ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
              {
                i18n.resolve(
                  "host.v2.calendar.review.consequence",
                  "What happens when you save",
                ).text
              }
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {plan.consequences.map((consequence) => {
                const text = consequenceText(
                  i18n,
                  consequence,
                  currency,
                  formats,
                );
                return (
                  <li
                    key={consequence.code}
                    className={cn(
                      "text-[0.8125rem] leading-5 text-slate-700",
                      text.translated && "notranslate",
                    )}
                  >
                    {text.text}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancel.text}
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={!plan.savable || pending}
            onClick={onConfirm}
            className={cn(
              "bg-[#d9774f] text-white hover:bg-[#c2643e]",
              save.translated && "notranslate",
            )}
            {...anchorProps(CALENDAR_ANCHOR.finalSave)}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {save.text}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
