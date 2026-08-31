"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";
import {
  EDITOR_GROUP_DIVIDER,
  EDITOR_GROUP_HEADING,
} from "@/components/host/v2/editor/editor-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { validateCancellationPolicy } from "@/lib/payments/cancellation-policy";
import { SectionSaveRow, SectionStatusLine } from "./section-save-row";

export function CancellationPolicyEditor({
  initialDays,
  reviewedAt,
  onSave,
}: {
  initialDays: number | null;
  reviewedAt: string | null;
  onSave: (days: number) => Promise<void>;
}) {
  const [value, setValue] = useState(initialDays === null ? "" : String(initialDays));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(reviewedAt !== null);
  const [error, setError] = useState(false);
  const valid = validateCancellationPolicy(value);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid.success) {
      setError(true);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      await onSave(valid.value);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    // Below the deposits, deliberately: what a host may keep when a guest cancels
    // depends on what they took in advance, so the answer above is the one that has to
    // be read first.
    <section className={cn("mx-auto w-full max-w-3xl pb-4", EDITOR_GROUP_DIVIDER)}>
      <h2 className={EDITOR_GROUP_HEADING}>
        <Tx k="host.editor.cancellation.heading" source="Cancellation policy" />
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        <Tx
          k="host.editor.cancellation.intro"
          source="Choose how many whole days before check-in the guest can cancel for a full refund. Enter 0 to allow a full refund until check-in begins."
        />
      </p>
      <form onSubmit={submit} className="mt-4">
        <div className="max-w-sm">
          <Label htmlFor="listing-free-cancellation-days" className="mb-1.5 block">
            <Tx
              k="host.editor.cancellation.days"
              source="Free cancellation until this many days before check-in"
            />
          </Label>
          <Input
            id="listing-free-cancellation-days"
            type="number"
            min="0"
            max="3650"
            step="1"
            value={value}
            disabled={saving}
            aria-invalid={error}
            onChange={(event) => {
              setValue(event.currentTarget.value);
              setSaved(false);
              setError(false);
            }}
          />
          <p className="mt-2 text-sm leading-6 text-slate-500">
            <Tx
              k="host.editor.cancellation.after_deadline"
              source="After that deadline, you may keep only an advance payment already received. A damage deposit is always separate and refundable."
            />
          </p>
        </div>
        {error ? (
          <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-rose-700">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <Tx
              k="host.editor.cancellation.error"
              source="Enter a whole number from 0 to 3650 and try again."
            />
          </p>
        ) : null}
        <SectionSaveRow
          saving={saving}
          status={
            <SectionStatusLine>
              {saved ? (
                <Tx
                  k="host.editor.cancellation.saved"
                  source="Cancellation policy saved"
                />
              ) : (
                <Tx
                  k="host.editor.cancellation.review"
                  source="Cancellation policy needs review"
                />
              )}
            </SectionStatusLine>
          }
          label={
            <Tx k="host.editor.cancellation.save" source="Save cancellation policy" />
          }
        />
      </form>
    </section>
  );
}
