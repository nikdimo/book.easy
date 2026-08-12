"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Link2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { interpolate, Tx, useI18n } from "@/lib/i18n/client";
import { providerForUrl, PROVIDER_LABELS } from "@/lib/listing-import/provider";
import type { ListingImportProvider } from "@/lib/listing-import/types";

interface ImportResponse {
  draftId?: string;
  error?: string;
  imported?: {
    provider: ListingImportProvider;
    photos: number;
    amenities: number;
    createdAmenities: number;
  };
}

export function ListingImportPanel() {
  const router = useRouter();
  const { resolve } = useI18n();
  const [url, setUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const detectedProvider = useMemo(() => providerForUrl(url.trim()), [url]);

  function runImport() {
    if (!url.trim()) {
      toast.error("Paste a public property or accommodation link.");
      return;
    }
    if (!detectedProvider) {
      toast.error("Paste a valid public HTTPS link.");
      return;
    }
    if (!rightsConfirmed) {
      toast.error("Confirm that you can reuse the listing content first.");
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch("/api/listing-import", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), rightsConfirmed }),
        });
        const data = (await response.json()) as ImportResponse;
        if (!response.ok || !data.draftId) {
          toast.error(data.error ?? "The listing could not be imported.");
          return;
        }
        const details = data.imported
          ? `${PROVIDER_LABELS[data.imported.provider]} detected: ${data.imported.photos} photos and ${data.imported.amenities} amenities found.`
          : "Review every detail before publishing.";
        toast.success(`Listing imported. ${details}`);
        router.replace(`/host/listings/new?draft=${encodeURIComponent(data.draftId)}`);
        router.refresh();
      } catch {
        toast.error("The import could not be completed. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-primary bg-primary p-4 text-primary-foreground shadow-sm md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
          <Download className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">
            <Tx k="host.import.title" source="Import an existing listing" />
          </h2>
          <p className="mt-0.5 text-sm text-primary-foreground/85">
            <Tx
              k="host.import.description"
              source="Paste any public property or accommodation link. Recognized platforms receive deeper extraction; other websites use their public metadata."
            />
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={resolve("host.import.url_label", "Listing URL").text}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            value={url}
            disabled={isPending}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runImport();
              }
            }}
            placeholder={resolve("host.import.url_placeholder", "https://example.com/property/...").text}
            className="pl-11"
          />
        </div>
        <Button
          type="button"
          disabled={isPending}
          onClick={runImport}
          className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:min-w-32"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Download />}
          {isPending ? (
            <Tx k="host.import.importing" source="Importing…" />
          ) : (
            <Tx k="host.import.action" source="Import" />
          )}
        </Button>
      </div>

      {url.trim() && (
        <p className={detectedProvider ? "mt-2 text-xs font-medium text-primary-foreground" : "mt-2 text-xs text-destructive-foreground"}>
          {detectedProvider
            ? interpolate(
                resolve("host.import.provider_detected", "{provider} link detected automatically"),
                { provider: PROVIDER_LABELS[detectedProvider] },
              ).text
            : resolve(
                "host.import.provider_unsupported",
                "Enter a valid public HTTPS link",
              ).text}
        </p>
      )}

      <div className="mt-3 flex items-start gap-2.5">
        <Checkbox
          id="listing-import-rights"
          checked={rightsConfirmed}
          disabled={isPending}
          onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor="listing-import-rights" className="cursor-pointer text-xs font-normal leading-relaxed text-primary-foreground/85">
          <span className="inline-flex items-center gap-1 font-medium text-primary-foreground">
            <ShieldCheck className="size-3.5" />
            <Tx k="host.import.rights_title" source="I own or manage this listing." />
          </span>{" "}
          <Tx
            k="host.import.rights_body"
            source="I have permission to reuse its text and photos. I will review imported details before publishing."
          />
        </Label>
      </div>
      <p className="mt-2 text-xs text-primary-foreground/85">
        <Tx
          k="host.import.note"
          source="Only publicly exposed information is imported. Generic websites may provide fewer details, and every imported field must be reviewed before publishing."
        />
      </p>
    </section>
  );
}
