"use client";

import { CircleAlert, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  PAYMENT_DETAIL_FIELDS,
  type PaymentDetailFieldDef,
  type PaymentDetailFieldValues,
  type PaymentDetailFieldIssue,
  type PaymentDetailIssues,
} from "@/lib/payments/payment-details";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import {
  ibanCountryCode,
  looksLikeIban,
} from "@/lib/payments/payment-field-validators";
import { cn } from "@/lib/utils";

/**
 * The structured fields for one payment method.
 *
 * Values are shown exactly as the host typed them — masking belongs on the collapsed
 * summary row, not here. Nobody can proofread an IBAN they cannot read.
 */
export function PaymentDetailFields({
  code,
  values,
  issues,
  disabled,
  idPrefix,
  onChange,
}: {
  code: PaymentMethodCode;
  values: PaymentDetailFieldValues;
  issues: PaymentDetailIssues | undefined;
  disabled: boolean;
  idPrefix: string;
  onChange: (key: string, value: string) => void;
}) {
  const fields = PAYMENT_DETAIL_FIELDS[code];
  if (fields.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <DetailField
          key={field.key}
          code={code}
          field={field}
          value={values[field.key] ?? ""}
          issue={issues?.[field.key]}
          disabled={disabled}
          id={`${idPrefix}-${field.key}`}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}

function DetailField({
  code,
  field,
  value,
  issue,
  disabled,
  id,
  onChange,
}: {
  code: PaymentMethodCode;
  field: PaymentDetailFieldDef;
  value: string;
  issue: PaymentDetailFieldIssue | undefined;
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
}) {
  const i18n = useI18n();
  const errorId = issue ? `${id}-error` : undefined;
  const hintId = `${id}-hint`;
  const wide = field.type === "NOTE" || field.type === "PAYMENT_URL";

  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-sm font-medium text-slate-800">
        <PaymentFieldLabel code={code} fieldKey={field.key} />
        {field.required ? null : (
          <span className="ml-1.5 font-normal text-slate-500">
            <Tx k="host.editor.payment_details.optional" source="optional" />
          </span>
        )}
      </Label>

      {field.type === "NETWORK" ? (
        <Select
          value={value || undefined}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full justify-between bg-white">
            <SelectValue
              placeholder={
                i18n.resolve(
                  "host.editor.payment_details.network_placeholder",
                  "Choose a network",
                ).text
              }
            />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                <NetworkOptionLabel value={option} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "NOTE" ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
          maxLength={field.maxLength}
          rows={2}
          autoComplete="off"
          spellCheck
          translate="no"
          aria-invalid={Boolean(issue)}
          aria-describedby={errorId ?? hintId}
          placeholder={paymentFieldPlaceholder(code, field.key, i18n.resolve)}
          className="bg-white"
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
          maxLength={field.maxLength}
          autoComplete="off"
          spellCheck={field.type === "NAME"}
          translate="no"
          inputMode={field.type === "PAYMENT_URL" ? "url" : "text"}
          aria-invalid={Boolean(issue)}
          aria-describedby={errorId ?? hintId}
          placeholder={paymentFieldPlaceholder(code, field.key, i18n.resolve)}
          className={cn(
            "h-12 bg-white text-base md:h-10 md:text-sm",
            (field.type === "ACCOUNT_IDENTIFIER" || field.type === "BIC") &&
              "font-mono tracking-tight",
          )}
        />
      )}

      {issue ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-5 text-rose-700"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <FieldIssueMessage issue={issue} />
        </p>
      ) : (
        <FieldHint id={hintId} field={field} value={value} />
      )}
    </div>
  );
}

/**
 * The only hint shown under a field, and only when it has something to say.
 *
 * A valid IBAN reports its country, because that is the one thing a host can eyeball to
 * catch a wrong-account paste. It says the format checks out and stops there: this
 * product has not contacted the bank and cannot claim the account exists or is theirs.
 */
function FieldHint({
  id,
  field,
  value,
}: {
  id: string;
  field: PaymentDetailFieldDef;
  value: string;
}) {
  const i18n = useI18n();
  const trimmed = value.trim();

  if (field.type === "ACCOUNT_IDENTIFIER" && trimmed && looksLikeIban(trimmed)) {
    const country = ibanCountryCode(trimmed);
    if (country) {
      const confirmation = i18n
        .resolve(
          "host.editor.payment_details.iban_country",
          "IBAN format checks out for {country}.",
        )
        .text.replace("{country}", regionName(country));
      return (
        <p id={id} className="flex items-start gap-1.5 text-xs leading-5 text-emerald-700">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {confirmation}{" "}
            <span className="text-slate-500">
              <Tx
                k="host.editor.payment_details.iban_not_verified"
                source="This checks the format only. It does not confirm the account or who owns it."
              />
            </span>
          </span>
        </p>
      );
    }
  }

  if (field.type === "CRYPTO_ADDRESS" && !trimmed) {
    return (
      <p id={id} className="text-xs leading-5 text-slate-500">
        <Tx
          k="host.editor.payment_details.wallet_public_only"
          source="Enter a public receiving address only. Never a seed phrase or private key."
        />
      </p>
    );
  }

  if (field.type === "PAYMENT_URL" && !trimmed) {
    return (
      <p id={id} className="text-xs leading-5 text-slate-500">
        <Tx
          k="host.editor.payment_details.https_only"
          source="Must be an HTTPS link."
        />
      </p>
    );
  }

  return <span id={id} className="sr-only" />;
}

function regionName(code: string): string {
  try {
    return (
      new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

function NetworkOptionLabel({ value }: { value: string }) {
  switch (value) {
    case "BITCOIN":
      return (
        <Tx
          k="host.editor.payment_details.network_bitcoin"
          source="Bitcoin (on-chain)"
        />
      );
    case "LIGHTNING":
      return (
        <Tx k="host.editor.payment_details.network_lightning" source="Lightning" />
      );
    default:
      return <>{value}</>;
  }
}

/** One label per field key. Keys repeat across methods and mean the same thing. */
export function PaymentFieldLabel({
  code,
  fieldKey,
}: {
  code: PaymentMethodCode;
  fieldKey: string;
}) {
  switch (fieldKey) {
    case "accountHolder":
      return (
        <Tx k="host.editor.payment_details.account_holder" source="Account holder" />
      );
    case "bankName":
      return <Tx k="host.editor.payment_details.bank_name" source="Bank name" />;
    case "bankAddress":
      return <Tx k="host.editor.payment_details.bank_address" source="Bank address" />;
    case "accountIdentifier":
      return (
        <Tx
          k="host.editor.payment_details.account_identifier"
          source="IBAN or account number"
        />
      );
    case "swiftBic":
      return <Tx k="host.editor.payment_details.swift_bic" source="SWIFT/BIC" />;
    case "reference":
      return (
        <Tx k="host.editor.payment_details.reference" source="Payment reference" />
      );
    case "note":
      return <Tx k="host.editor.payment_details.note" source="Note for the guest" />;
    case "network":
      return <Tx k="host.editor.payment_details.network" source="Network" />;
    case "walletAddress":
      return (
        <Tx
          k="host.editor.payment_details.wallet_address"
          source="Public wallet address"
        />
      );
    case "paymentUrl":
      return <Tx k="host.editor.payment_details.payment_url" source="Payment link" />;
    case "providerIdentifier":
      return <ProviderFieldLabel code={code} />;
    case "value":
      return (
        <Tx k="host.editor.payment_details.other_value" source="Payment details" />
      );
    default:
      return <>{fieldKey}</>;
  }
}

function ProviderFieldLabel({ code }: { code: PaymentMethodCode }) {
  switch (code) {
    case "PAYPAL":
      return (
        <Tx
          k="host.editor.payment_details.paypal_identifier"
          source="PayPal email, handle, or link"
        />
      );
    case "REVOLUT":
      return (
        <Tx
          k="host.editor.payment_details.revolut_identifier"
          source="Revtag, phone, email, or link"
        />
      );
    case "WISE":
      return (
        <Tx
          k="host.editor.payment_details.wise_identifier"
          source="Wise identifier or link"
        />
      );
    default:
      return (
        <Tx k="host.editor.payment_details.other_value" source="Payment details" />
      );
  }
}

function paymentFieldPlaceholder(
  code: PaymentMethodCode,
  fieldKey: string,
  resolve: ReturnType<typeof useI18n>["resolve"],
): string {
  switch (fieldKey) {
    case "accountHolder":
      return resolve(
        "host.editor.payment_details.account_holder_placeholder",
        "The name on the account",
      ).text;
    case "bankName":
      return resolve(
        "host.editor.payment_details.bank_name_placeholder",
        "Your bank",
      ).text;
    case "bankAddress":
      return resolve(
        "host.editor.payment_details.bank_address_placeholder",
        "Branch address, if your bank asks for it",
      ).text;
    case "accountIdentifier":
      return resolve(
        "host.editor.payment_details.account_identifier_placeholder",
        "MK07 2500 1200 0058 984",
      ).text;
    case "swiftBic":
      return resolve("host.editor.payment_details.swift_placeholder", "KOBSMK2X")
        .text;
    case "reference":
      return resolve(
        "host.editor.payment_details.reference_placeholder",
        "What the guest should write on the transfer",
      ).text;
    case "note":
      return resolve(
        "host.editor.payment_details.note_placeholder",
        "Anything else the guest should know",
      ).text;
    case "walletAddress":
      return resolve(
        "host.editor.payment_details.wallet_placeholder",
        "bc1…",
      ).text;
    case "paymentUrl":
      return resolve(
        "host.editor.payment_details.payment_url_placeholder",
        "https://",
      ).text;
    case "providerIdentifier":
      return providerPlaceholder(code, resolve);
    case "value":
      return resolve(
        "host.editor.payment_details.other_value_placeholder",
        "The handle, number, or link the guest needs",
      ).text;
    default:
      return "";
  }
}

function providerPlaceholder(
  code: PaymentMethodCode,
  resolve: ReturnType<typeof useI18n>["resolve"],
): string {
  switch (code) {
    case "PAYPAL":
      return resolve(
        "host.editor.payment_details.paypal_placeholder",
        "name@example.com",
      ).text;
    case "REVOLUT":
      return resolve("host.editor.payment_details.revolut_placeholder", "@revtag")
        .text;
    case "WISE":
      return resolve(
        "host.editor.payment_details.wise_placeholder",
        "name@example.com",
      ).text;
    default:
      return "";
  }
}

/**
 * One message per validation failure, next to the field that caused it.
 *
 * None of these repeat the value they are about — an error string can end up in a log
 * or a screenshot, and payment coordinates must not travel that way.
 */
export function FieldIssueMessage({ issue }: { issue: PaymentDetailFieldIssue }) {
  switch (issue) {
    case "REQUIRED":
      return (
        <Tx
          k="host.editor.payment_details.issue_required"
          source="Fill this in, or clear the rest of this method to finish it later."
        />
      );
    case "TOO_LONG":
      return (
        <Tx k="host.editor.payment_details.issue_too_long" source="This is too long." />
      );
    case "UNSAFE_CREDENTIALS":
      return (
        <Tx
          k="host.editor.payment_details.issue_credentials"
          source="Remove card details, passwords, PINs, seed phrases, private keys, or recovery information."
        />
      );
    case "LOOKS_LIKE_CARD":
      return (
        <Tx
          k="host.editor.payment_details.issue_card"
          source="That looks like a payment card number. Card numbers cannot be shared here."
        />
      );
    case "INVALID_IBAN":
      return (
        <Tx
          k="host.editor.payment_details.issue_iban_format"
          source="That is not a valid IBAN for its country. Check the length and the country code."
        />
      );
    case "IBAN_CHECKSUM":
      return (
        <Tx
          k="host.editor.payment_details.issue_iban_checksum"
          source="This IBAN fails its check digits, so at least one character is wrong."
        />
      );
    case "INVALID_ACCOUNT":
      return (
        <Tx
          k="host.editor.payment_details.issue_account"
          source="Enter an IBAN or a domestic account number, without extra words."
        />
      );
    case "INVALID_BIC":
      return (
        <Tx
          k="host.editor.payment_details.issue_bic"
          source="A SWIFT/BIC is 8 or 11 characters, like KOBSMK2X."
        />
      );
    case "INVALID_URL":
      return (
        <Tx
          k="host.editor.payment_details.issue_url"
          source="Enter a complete link, including the address of the site."
        />
      );
    case "NOT_HTTPS":
      return (
        <Tx
          k="host.editor.payment_details.issue_https"
          source="Payment links must start with https:// so the page cannot be tampered with."
        />
      );
    case "INVALID_ADDRESS":
      return (
        <Tx
          k="host.editor.payment_details.issue_address"
          source="That is not a valid address for the network you chose."
        />
      );
    case "LOOKS_LIKE_SECRET":
      return (
        <Tx
          k="host.editor.payment_details.issue_secret"
          source="That looks like a seed phrase or private key. Enter only your public receiving address."
        />
      );
    case "UNKNOWN_OPTION":
      return (
        <Tx
          k="host.editor.payment_details.issue_option"
          source="Choose a network first."
        />
      );
    case "INVALID_TEXT":
      return (
        <Tx
          k="host.editor.payment_details.issue_text"
          source="Remove line breaks and unusual characters."
        />
      );
    default:
      return (
        <Tx
          k="host.editor.payment_details.issue_generic"
          source="Check this value and try again."
        />
      );
  }
}
