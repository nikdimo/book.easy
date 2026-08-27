"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  validateDepositPolicies,
  type DepositAmountType,
  type DepositDueTiming,
  type DepositPoliciesSnapshotV2,
} from "@/lib/payments/deposit-policies";

/**
 * One editable policy section. `enabled` is kept alongside the values rather than
 * replacing them with null so a host who switches a section off and on again gets their
 * numbers back instead of an empty form.
 */
export type DepositSectionDraft = {
  enabled: boolean;
  amountType: DepositAmountType;
  value: string;
  dueTiming: DepositDueTiming;
  dueDaysBeforeCheckIn: number | null;
};

export type DamageDepositSectionDraft = DepositSectionDraft & {
  returnDaysAfterCheckout: number | null;
};

export type DepositPoliciesDraft = {
  advancePayment: DepositSectionDraft;
  damageDeposit: DamageDepositSectionDraft;
};

const EMPTY_SECTION: DepositSectionDraft = {
  enabled: false,
  amountType: "FIXED",
  value: "",
  dueTiming: "AFTER_ACCEPTANCE",
  dueDaysBeforeCheckIn: null,
};

/**
 * The host's answer to two independent questions: do you want an advance payment toward
 * the stay, and do you want a refundable damage deposit?
 *
 * They are two sections rather than one section with a "purpose" choice because they are
 * not alternatives — a host may want neither, either, or both, and the old single-purpose
 * dropdown made "both" unsayable.
 */
export function DepositPoliciesEditor({
  initialValue,
  listingCurrency,
  onSave,
}: {
  initialValue: DepositPoliciesSnapshotV2;
  listingCurrency: string;
  onSave: (draft: DepositPoliciesDraft) => Promise<void>;
}) {
  const i18n = useI18n();
  const initialDraft = (): DepositPoliciesDraft => ({
    advancePayment: initialValue.advancePayment
      ? {
          enabled: true,
          amountType: initialValue.advancePayment.amountType,
          value: initialValue.advancePayment.value,
          dueTiming: initialValue.advancePayment.dueTiming,
          dueDaysBeforeCheckIn: initialValue.advancePayment.dueDaysBeforeCheckIn,
        }
      : { ...EMPTY_SECTION },
    damageDeposit: initialValue.damageDeposit
      ? {
          enabled: true,
          amountType: initialValue.damageDeposit.amountType,
          value: initialValue.damageDeposit.value,
          dueTiming: initialValue.damageDeposit.dueTiming,
          dueDaysBeforeCheckIn: initialValue.damageDeposit.dueDaysBeforeCheckIn,
          returnDaysAfterCheckout:
            initialValue.damageDeposit.returnDaysAfterCheckout,
        }
      : { ...EMPTY_SECTION, returnDaysAfterCheckout: null },
  });
  const [draft, setDraft] = useState<DepositPoliciesDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialValue.status === "REVIEWED");
  const [error, setError] = useState<string | null>(null);

  function change(next: DepositPoliciesDraft) {
    setDraft(next);
    setSaved(false);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateDepositPolicies(toPayload(draft, listingCurrency)).success) {
      setError(
        i18n.resolve(
          "host.editor.deposit.invalid",
          "Check the amounts and timing before saving.",
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
          "The deposit settings were not saved. Try again.",
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
            <Tx
              k="host.editor.deposit.heading"
              source="Advance payment and damage deposit"
            />
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            <Tx
              k="host.editor.deposit.intro"
              source="Set these two independently. You can ask for neither, either, or both. Linger Homes records these terms but does not collect, hold, verify, or refund money."
            />
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <fieldset disabled={saving} className="space-y-4">
          <PolicySection
            kind="advance-payment"
            enabled={draft.advancePayment.enabled}
            onEnabledChange={(enabled) =>
              change({
                ...draft,
                advancePayment: { ...draft.advancePayment, enabled },
              })
            }
            title={
              <Tx
                k="host.editor.deposit.advance.title"
                source="Advance payment toward the booking"
              />
            }
            description={
              <Tx
                k="host.editor.deposit.advance.description"
                source="Part of the booking price, paid early. It counts toward what the guest owes for the stay — it is not a refundable damage deposit."
              />
            }
          >
            <SectionFields
              idPrefix="advance-payment"
              listingCurrency={listingCurrency}
              section={draft.advancePayment}
              onChange={(advancePayment) => change({ ...draft, advancePayment })}
            />
          </PolicySection>

          <PolicySection
            kind="damage-deposit"
            enabled={draft.damageDeposit.enabled}
            onEnabledChange={(enabled) =>
              change({
                ...draft,
                damageDeposit: { ...draft.damageDeposit, enabled },
              })
            }
            title={
              <Tx
                k="host.editor.deposit.damage.title"
                source="Refundable damage deposit"
              />
            }
            description={
              <Tx
                k="host.editor.deposit.damage.description"
                source="Separate from the booking price. Security against damage that you give back to the guest afterwards."
              />
            }
          >
            <SectionFields
              idPrefix="damage-deposit"
              listingCurrency={listingCurrency}
              section={draft.damageDeposit}
              onChange={(section) =>
                change({
                  ...draft,
                  damageDeposit: {
                    ...draft.damageDeposit,
                    ...section,
                  },
                })
              }
            >
              <NumberField
                id="damage-deposit-return-days"
                label={
                  <Tx
                    k="host.editor.deposit.return_days"
                    source="Return within days after checkout (optional)"
                  />
                }
                min={1}
                value={draft.damageDeposit.returnDaysAfterCheckout}
                onChange={(returnDaysAfterCheckout) =>
                  change({
                    ...draft,
                    damageDeposit: {
                      ...draft.damageDeposit,
                      returnDaysAfterCheckout,
                    },
                  })
                }
              />
            </SectionFields>
          </PolicySection>
        </fieldset>

        {error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-rose-700">
            <CircleAlert className="size-4" aria-hidden /> {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {saved ? (
              <Tx k="host.editor.deposit.saved" source="Deposit settings saved" />
            ) : (
              <Tx
                k="host.editor.deposit.not_saved"
                source="Deposit settings need review"
              />
            )}
          </p>
          <Button
            type="submit"
            disabled={saving}
            className="rounded-full bg-slate-900 px-6"
          >
            {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            <Tx k="host.editor.deposit.save" source="Save deposit settings" />
          </Button>
        </div>
      </form>
    </section>
  );
}

function PolicySection({
  kind,
  enabled,
  onEnabledChange,
  title,
  description,
  children,
}: {
  kind: "advance-payment" | "damage-deposit";
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      data-deposit-section={kind}
      data-enabled={enabled}
      className="rounded-xl border border-slate-200 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={labelId} className="text-sm font-semibold text-slate-900">
            {title}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-labelledby={labelId}
          className="mt-0.5 shrink-0"
        />
      </div>
      {enabled ? (
        <div className="mt-4 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SectionFields({
  idPrefix,
  listingCurrency,
  section,
  onChange,
  children,
}: {
  idPrefix: string;
  listingCurrency: string;
  section: DepositSectionDraft;
  onChange: (section: DepositSectionDraft) => void;
  children?: ReactNode;
}) {
  const i18n = useI18n();
  return (
    <>
      <SelectField
        id={`${idPrefix}-amount-type`}
        label={<Tx k="host.editor.deposit.amount_type" source="Amount type" />}
        value={section.amountType}
        onValueChange={(value) =>
          onChange({ ...section, amountType: value as DepositAmountType })
        }
        options={[
          {
            value: "FIXED",
            label: i18n.resolve("host.editor.deposit.fixed", "Fixed amount").text,
          },
          {
            value: "PERCENTAGE",
            label: i18n.resolve(
              "host.editor.deposit.percentage",
              "Percentage of booking total",
            ).text,
          },
        ]}
      />

      <Field
        id={`${idPrefix}-value`}
        label={
          section.amountType === "PERCENTAGE" ? (
            <Tx
              k="host.editor.deposit.percent_value"
              source="Percentage of booking total"
            />
          ) : (
            <Tx k="host.editor.deposit.amount" source="Amount" />
          )
        }
      >
        <div className="relative">
          <Input
            id={`${idPrefix}-value`}
            type="number"
            min="0.01"
            max={section.amountType === "PERCENTAGE" ? "100" : undefined}
            step="0.01"
            value={section.value}
            onChange={(event) =>
              onChange({ ...section, value: event.currentTarget.value })
            }
            className="bg-white pr-14"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs font-semibold text-slate-500">
            {section.amountType === "PERCENTAGE" ? "%" : listingCurrency}
          </span>
        </div>
      </Field>

      <SelectField
        id={`${idPrefix}-due-timing`}
        label={<Tx k="host.editor.deposit.due" source="When is it due?" />}
        value={section.dueTiming}
        onValueChange={(value) => {
          const dueTiming = value as DepositDueTiming;
          onChange({
            ...section,
            dueTiming,
            // A day count left behind by a timing change would be rejected by the
            // server as a field that no longer applies.
            dueDaysBeforeCheckIn:
              dueTiming === "DAYS_BEFORE_CHECK_IN"
                ? (section.dueDaysBeforeCheckIn ?? 7)
                : null,
          });
        }}
        options={[
          {
            value: "AFTER_ACCEPTANCE",
            label: i18n.resolve(
              "host.editor.deposit.after_acceptance",
              "After booking acceptance",
            ).text,
          },
          {
            value: "DAYS_BEFORE_CHECK_IN",
            label: i18n.resolve(
              "host.editor.deposit.before_checkin",
              "A number of days before check-in",
            ).text,
          },
          {
            value: "AT_CHECK_IN",
            label: i18n.resolve("host.editor.deposit.at_checkin", "At check-in").text,
          },
        ]}
      />

      {section.dueTiming === "DAYS_BEFORE_CHECK_IN" ? (
        <NumberField
          id={`${idPrefix}-due-days`}
          label={
            <Tx k="host.editor.deposit.days_before" source="Days before check-in" />
          }
          min={1}
          value={section.dueDaysBeforeCheckIn}
          onChange={(dueDaysBeforeCheckIn) =>
            onChange({ ...section, dueDaysBeforeCheckIn })
          }
        />
      ) : null}

      {children}
    </>
  );
}

/**
 * The application's standard Select, full width and labelled by the visible field label.
 *
 * `aria-labelledby` rather than `htmlFor`: the trigger is a button, and pointing the
 * label at it by id is what Radix's own listbox semantics expect.
 */
function SelectField({
  id,
  label,
  value,
  onValueChange,
  options,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const labelId = `${id}-label`;
  return (
    <div className="block text-sm font-medium text-slate-800">
      <Label id={labelId} className="mb-1.5 block">
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          id={id}
          aria-labelledby={labelId}
          className="w-full justify-between bg-white"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  id,
  label,
  min,
  value,
  onChange,
}: {
  id: string;
  label: ReactNode;
  min: number;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        type="number"
        min={String(min)}
        step="1"
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.currentTarget.value ? Number(event.currentTarget.value) : null,
          )
        }
        className="bg-white"
      />
    </Field>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="block text-sm font-medium text-slate-800">
      <Label htmlFor={id} className="mb-1.5 block">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * The wire shape the Server Action validates. A switched-off section sends only its
 * flag, so no stale amount can reach the server hidden behind a disabled toggle.
 */
export function toPayload(draft: DepositPoliciesDraft, currency: string) {
  return {
    currency,
    advancePayment: draft.advancePayment.enabled
      ? {
          enabled: true,
          amountType: draft.advancePayment.amountType,
          value: draft.advancePayment.value,
          dueTiming: draft.advancePayment.dueTiming,
          dueDaysBeforeCheckIn: draft.advancePayment.dueDaysBeforeCheckIn,
        }
      : { enabled: false },
    damageDeposit: draft.damageDeposit.enabled
      ? {
          enabled: true,
          amountType: draft.damageDeposit.amountType,
          value: draft.damageDeposit.value,
          dueTiming: draft.damageDeposit.dueTiming,
          dueDaysBeforeCheckIn: draft.damageDeposit.dueDaysBeforeCheckIn,
          returnDaysAfterCheckout: draft.damageDeposit.returnDaysAfterCheckout,
        }
      : { enabled: false },
  };
}
