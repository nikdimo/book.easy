"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  validateDepositPolicy,
  type DepositDueTiming,
  type DepositPolicyCode,
  type DepositPolicySnapshotV1,
  type DepositPurpose,
} from "@/lib/payments/deposit-policy";

export type DepositPolicyDraft = {
  policy: DepositPolicyCode;
  purpose: DepositPurpose | null;
  value: string | null;
  dueTiming: DepositDueTiming;
  dueDaysBeforeCheckIn: number | null;
  returnDaysAfterCheckout: number | null;
};

export function DepositPolicyEditor({
  initialValue,
  listingCurrency,
  onSave,
}: {
  initialValue: DepositPolicySnapshotV1;
  listingCurrency: string;
  onSave: (draft: DepositPolicyDraft) => Promise<void>;
}) {
  const i18n = useI18n();
  const initialDraft = (): DepositPolicyDraft => ({
    policy: initialValue.policy,
    purpose: initialValue.purpose,
    value: initialValue.value,
    dueTiming: initialValue.dueTiming,
    dueDaysBeforeCheckIn: initialValue.dueDaysBeforeCheckIn,
    returnDaysAfterCheckout: initialValue.returnDaysAfterCheckout,
  });
  const [draft, setDraft] = useState<DepositPolicyDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialValue.status === "REVIEWED");
  const [error, setError] = useState<string | null>(null);

  function change(next: DepositPolicyDraft) {
    setDraft(next);
    setSaved(false);
    setError(null);
  }

  function selectPolicy(policy: DepositPolicyCode) {
    if (policy === "NONE") {
      change({
        policy,
        purpose: null,
        value: null,
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: null,
      });
      return;
    }
    change({
      ...draft,
      policy,
      purpose: draft.purpose ?? "ADVANCE_PAYMENT",
      value: draft.value ?? "",
      dueTiming: draft.dueTiming ?? "AFTER_ACCEPTANCE",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDepositPolicy({
      ...draft,
      currency: draft.policy === "NONE" ? null : listingCurrency,
    });
    if (!validation.success) {
      setError(
        i18n.resolve(
          "host.editor.deposit.invalid",
          "Check the deposit amount and timing before saving.",
        ).text,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setSaved(true);
    } catch {
      setError(
        i18n.resolve(
          "host.editor.deposit.save_error",
          "The deposit policy was not saved. Try again.",
        ).text,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl border-t border-slate-200 py-8 pb-14">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-slate-600" aria-hidden />
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            <Tx k="host.editor.deposit.heading" source="Deposit policy" />
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            <Tx
              k="host.editor.deposit.intro"
              source="Tell guests whether you require an advance payment or refundable damage deposit. Linger Homes records these terms but does not collect, hold, verify, or refund money."
            />
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-5">
        <fieldset disabled={saving}>
          <legend className="text-sm font-semibold text-slate-900">
            <Tx k="host.editor.deposit.required" source="Is a deposit required?" />
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <PolicyChoice
              value="NONE"
              checked={draft.policy === "NONE"}
              label={<Tx k="host.editor.deposit.none" source="No deposit" />}
              onChange={selectPolicy}
            />
            <PolicyChoice
              value="FIXED"
              checked={draft.policy === "FIXED"}
              label={<Tx k="host.editor.deposit.fixed" source="Fixed amount" />}
              onChange={selectPolicy}
            />
            <PolicyChoice
              value="PERCENTAGE"
              checked={draft.policy === "PERCENTAGE"}
              label={<Tx k="host.editor.deposit.percentage" source="Percentage" />}
              onChange={selectPolicy}
            />
          </div>
        </fieldset>

        {draft.policy !== "NONE" ? (
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <Field label={<Tx k="host.editor.deposit.purpose" source="Purpose" />}>
              <select
                value={draft.purpose ?? "ADVANCE_PAYMENT"}
                onChange={(event) => {
                  const purpose = event.currentTarget.value as DepositPurpose;
                  change({
                    ...draft,
                    purpose,
                    returnDaysAfterCheckout:
                      purpose === "DAMAGE_SECURITY"
                        ? draft.returnDaysAfterCheckout
                        : null,
                  });
                }}
                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
              >
                <option value="ADVANCE_PAYMENT">
                  {i18n.resolve("host.editor.deposit.advance", "Advance payment").text}
                </option>
                <option value="DAMAGE_SECURITY">
                  {i18n.resolve("host.editor.deposit.damage", "Refundable damage deposit").text}
                </option>
              </select>
            </Field>

            <Field
              label={
                draft.policy === "PERCENTAGE" ? (
                  <Tx k="host.editor.deposit.percent_value" source="Percentage of booking total" />
                ) : (
                  <Tx k="host.editor.deposit.amount" source="Deposit amount" />
                )
              }
            >
              <div className="relative">
                <Input
                  type="number"
                  min="0.01"
                  max={draft.policy === "PERCENTAGE" ? "100" : undefined}
                  step="0.01"
                  value={draft.value ?? ""}
                  onChange={(event) => change({ ...draft, value: event.currentTarget.value })}
                  className="bg-white pr-14"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs font-semibold text-slate-500">
                  {draft.policy === "PERCENTAGE" ? "%" : listingCurrency}
                </span>
              </div>
            </Field>

            <Field label={<Tx k="host.editor.deposit.due" source="When is it due?" />}>
              <select
                value={draft.dueTiming}
                onChange={(event) => {
                  const dueTiming = event.currentTarget.value as DepositDueTiming;
                  change({
                    ...draft,
                    dueTiming,
                    dueDaysBeforeCheckIn:
                      dueTiming === "DAYS_BEFORE_CHECK_IN"
                        ? (draft.dueDaysBeforeCheckIn ?? 7)
                        : null,
                  });
                }}
                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
              >
                <option value="AFTER_ACCEPTANCE">
                  {i18n.resolve("host.editor.deposit.after_acceptance", "After booking acceptance").text}
                </option>
                <option value="DAYS_BEFORE_CHECK_IN">
                  {i18n.resolve("host.editor.deposit.before_checkin", "Before check-in").text}
                </option>
                <option value="AT_CHECK_IN">
                  {i18n.resolve("host.editor.deposit.at_checkin", "At check-in").text}
                </option>
              </select>
            </Field>

            {draft.dueTiming === "DAYS_BEFORE_CHECK_IN" ? (
              <Field label={<Tx k="host.editor.deposit.days_before" source="Days before check-in" />}>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.dueDaysBeforeCheckIn ?? ""}
                  onChange={(event) =>
                    change({
                      ...draft,
                      dueDaysBeforeCheckIn: event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : null,
                    })
                  }
                  className="bg-white"
                />
              </Field>
            ) : null}

            {draft.purpose === "DAMAGE_SECURITY" ? (
              <Field
                label={
                  <Tx
                    k="host.editor.deposit.return_days"
                    source="Return within days after checkout (optional)"
                  />
                }
              >
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.returnDaysAfterCheckout ?? ""}
                  onChange={(event) =>
                    change({
                      ...draft,
                      returnDaysAfterCheckout: event.currentTarget.value
                        ? Number(event.currentTarget.value)
                        : null,
                    })
                  }
                  className="bg-white"
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-rose-700">
            <CircleAlert className="size-4" aria-hidden /> {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {saved ? (
              <Tx k="host.editor.deposit.saved" source="Deposit policy saved" />
            ) : (
              <Tx k="host.editor.deposit.not_saved" source="Deposit policy needs review" />
            )}
          </p>
          <Button type="submit" disabled={saving} className="rounded-full bg-slate-900 px-6">
            {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            <Tx k="host.editor.deposit.save" source="Save deposit policy" />
          </Button>
        </div>
      </form>
    </section>
  );
}

function PolicyChoice({
  value,
  checked,
  label,
  onChange,
}: {
  value: DepositPolicyCode;
  checked: boolean;
  label: React.ReactNode;
  onChange: (value: DepositPolicyCode) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium">
      <input
        type="radio"
        name="deposit-policy"
        checked={checked}
        onChange={() => onChange(value)}
        className="size-4 accent-slate-900"
      />
      {label}
    </label>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
