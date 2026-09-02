"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { EDITOR_GROUP_HEADING } from "@/components/host/v2/editor/editor-group";
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
import { SectionSaveRow, SectionStatusLine } from "./section-save-row";
import {
  type DepositAmountType,
  type DepositDueTiming,
  type DepositPoliciesSnapshotV2,
} from "@/lib/payments/deposit-policies";
import {
  depositPoliciesDraftFromSnapshot,
  depositPoliciesDraftIsValid,
  depositPoliciesPayload,
  type DamageDepositSectionDraft,
  type DepositPoliciesDraft,
  type DepositSectionDraft,
} from "@/lib/host/v2/listing-deposit-draft";

/**
 * The form shapes and the payload builder now live in `lib/host/v2/listing-deposit-draft`
 * so the publish action can read a draft's answer through the same conversion this
 * editor writes it with. Re-exported here because this module was their address first
 * and every existing importer still uses it.
 */
export {
  depositPoliciesPayload as toPayload,
  type DamageDepositSectionDraft,
  type DepositPoliciesDraft,
  type DepositSectionDraft,
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
  onChange,
  showSubmit = true,
}: {
  initialValue: DepositPoliciesSnapshotV2;
  listingCurrency: string;
  onSave: (draft: DepositPoliciesDraft) => Promise<void>;
  /** Every edit, with whether the answer could be published as it stands. Both
   *  sections off is complete — it is how a host says "I ask for neither". */
  onChange?: (
    draft: DepositPoliciesDraft,
    meta: { isComplete: boolean },
  ) => void;
  /** Listing creation owns navigation in its fixed footer, so it reuses the fields
   *  without rendering this editor's standalone save row. */
  showSubmit?: boolean;
}) {
  const i18n = useI18n();
  const [draft, setDraft] = useState<DepositPoliciesDraft>(() =>
    depositPoliciesDraftFromSnapshot(initialValue),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialValue.status === "REVIEWED");
  const [error, setError] = useState<string | null>(null);

  function change(next: DepositPoliciesDraft) {
    setDraft(next);
    setSaved(false);
    setError(null);
    onChange?.(next, {
      isComplete: depositPoliciesDraftIsValid(next, listingCurrency),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!depositPoliciesDraftIsValid(draft, listingCurrency)) {
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
    <section className="mx-auto w-full max-w-3xl pt-6">
      <h2 className={EDITOR_GROUP_HEADING}>
        <Tx
          k="host.editor.deposit.heading"
          source="Advance payment and damage deposit"
        />
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        <Tx
          k="host.editor.deposit.intro"
          source="Set these two independently. You can ask for neither, either, or both. Linger Homes records these terms but does not collect, hold, verify, or refund money."
        />
      </p>

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={saving} className="divide-y divide-slate-100 border-y border-slate-100">
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
            <DepositSectionFields
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
            <DepositSectionFields
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
            </DepositSectionFields>
          </PolicySection>
        </fieldset>

        {error ? (
          <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-rose-700">
            <CircleAlert className="size-4 shrink-0" aria-hidden /> {error}
          </p>
        ) : null}
        {showSubmit ? (
          <SectionSaveRow
            saving={saving}
            status={
              <SectionStatusLine>
                {saved ? (
                  <Tx k="host.editor.deposit.saved" source="Deposit settings saved" />
                ) : (
                  <Tx
                    k="host.editor.deposit.not_saved"
                    source="Deposit settings need review"
                  />
                )}
              </SectionStatusLine>
            }
            label={<Tx k="host.editor.deposit.save" source="Save deposit settings" />}
          />
        ) : null}
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
    // A row with a rule under it, not a card. These are two questions in a list of
    // questions; a box around each one turns the section into a stack of frames and
    // makes the page read as a dashboard rather than as a form.
    <div data-deposit-section={kind} data-enabled={enabled} className="py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium text-slate-900">
            {title}
          </p>
          <p className="mt-0.5 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {/* A switch, not a checkbox: this turns an optional feature and its dependent
            fields on, which is exactly what a switch is for. */}
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-labelledby={labelId}
          className="mt-1 shrink-0"
        />
      </div>
      {enabled ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * The amount, timing and return fields of one deposit section.
 *
 * Exported so the new-listing step can put the same fields behind its own
 * "Require / Not required" choice. The two screens ask the question differently — a
 * switch there, two radio cards here — but a host must not meet two different sets of
 * fields, two different validations or two different ids depending on which one they
 * are standing on.
 */
export function DepositSectionFields({
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
