"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { interpolate, Tx, useI18n } from "@/lib/i18n/client";
import { providerForUrl, PROVIDER_LABELS } from "@/lib/listing-import/provider";

/**
 * The link field, the rights confirmation, and the button.
 *
 * UI only: nothing here posts. `providerForUrl` runs entirely in the browser and only
 * reads the string the host typed, so live detection costs no request and creates no
 * draft — it is the one piece of real behaviour this screen can honestly have yet.
 */
export function ImportListingForm() {
  const { resolve } = useI18n();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const trimmed = url.trim();
  const provider = useMemo(() => providerForUrl(trimmed), [trimmed]);
  const [isPending, startTransition] = useTransition();

  function runImport() {
    if (!provider || !rightsConfirmed) {
      toast.error(
        !provider
          ? resolve(
              "host.v2.import.link_invalid",
              "Enter a valid public HTTPS listing link.",
            ).text
          : resolve(
              "host.v2.import.rights_required",
              "Confirm that you can reuse the listing content first.",
            ).text,
      );
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch("/api/listing-import", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed, rightsConfirmed }),
        });
        const result = (await response.json()) as { draftId?: string; error?: string };
        const failed = resolve(
          "host.v2.import.failed",
          "The listing could not be imported.",
        ).text;
        // The API's own refusal is written for the host; a transport fault is not, so
        // the `catch` below reports this same sentence rather than "Failed to fetch".
        if (!response.ok || !result.draftId) throw new Error(result.error ?? failed);
        toast.success(
          resolve(
            "host.v2.import.succeeded",
            "Listing imported. Review the details before publishing.",
          ).text,
        );
        router.replace(`/host/start/resume?draft=${encodeURIComponent(result.draftId)}`);
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : resolve("host.v2.import.failed", "The listing could not be imported.").text,
        );
      }
    });
  }

  return (
    <div className="mt-9">
      <label
        htmlFor="import-url"
        className="block font-heading text-sm font-semibold text-slate-950"
      >
        <Tx k="host.v2.import.url_label" source="Listing link" />
      </label>
      {/* A hairline box rather than a filled field: on a page this empty, a grey input
          would be the only block of colour and would read as the subject of the screen
          instead of the thing you type in. */}
      <input
        id="import-url"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={
          resolve("host.import.url_placeholder", "https://example.com/property/...").text
        }
        className="mt-2.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      />

      {/* Reserved height, so the block below does not jump the moment a link is typed. */}
      <p className="mt-2 min-h-4 text-xs">
        {trimmed ? (
          provider ? (
            <span className="text-slate-500">
              {
                interpolate(
                  resolve(
                    "host.import.provider_detected",
                    "{provider} link detected automatically"
                  ),
                  { provider: PROVIDER_LABELS[provider] }
                ).text
              }
            </span>
          ) : (
            <span className="text-[#0f172a]">
              {
                resolve("host.import.provider_unsupported", "Enter a valid public HTTPS link")
                  .text
              }
            </span>
          )
        ) : null}
      </p>

      <div className="mt-6 flex items-start gap-3">
        <Checkbox
          id="import-rights"
          checked={rightsConfirmed}
          onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
          className="mt-0.5 shrink-0"
        />
        <label
          htmlFor="import-rights"
          className="cursor-pointer text-[0.8125rem] leading-relaxed text-slate-500"
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-950">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            <Tx k="host.import.rights_title" source="I own or manage this listing." />
          </span>{" "}
          <Tx
            k="host.import.rights_body"
            source="I have permission to reuse its text and photos. I will review imported details before publishing."
          />
        </label>
      </div>

      <button
        type="button"
        onClick={runImport}
        disabled={isPending}
        className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-full bg-slate-950 px-8 font-heading text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:w-auto"
      >
        {isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
        <Tx k="host.import.action" source="Import" />
      </button>

      <p className="mt-6 text-xs leading-relaxed text-slate-400">
        <Tx
          k="host.v2.import.note"
          source="Only publicly available information is imported. Review every detail before publishing."
        />
      </p>
    </div>
  );
}
