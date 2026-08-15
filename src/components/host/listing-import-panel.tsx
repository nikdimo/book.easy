"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, Loader2, ShieldCheck, X } from "lucide-react";
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
  // Importing is the optional side path, not the job of this step. Collapsed by
  // default, a host who just wants to pick "Apartment" never has to read past one line.
  const [expanded, setExpanded] = useState(false);
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

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm outline-none transition-all hover:border-primary/50 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm">
          <Tx
            k="host.import.trigger"
            source="Already listed elsewhere? Import it from a link"
          />
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm md:p-4">
      <div className="flex items-start gap-2.5">
        <Download className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            <Tx k="host.import.title" source="Import an existing listing" />
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Tx
              k="host.import.description"
              source="Paste any public property or accommodation link. Recognized platforms receive deeper extraction; other websites use their public metadata."
            />
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          aria-label={resolve("host.import.collapse", "Close import").text}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
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
            autoFocus
          />
        </div>
        <Button
          type="button"
          disabled={isPending}
          onClick={runImport}
          className="sm:min-w-32"
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
        <p className={detectedProvider ? "mt-2 text-xs font-medium text-primary" : "mt-2 text-xs text-destructive"}>
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
        <Label htmlFor="listing-import-rights" className="cursor-pointer text-xs font-normal leading-relaxed text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <ShieldCheck className="size-3.5" />
            <Tx k="host.import.rights_title" source="I own or manage this listing." />
          </span>{" "}
          <Tx
            k="host.import.rights_body"
            source="I have permission to reuse its text and photos. I will review imported details before publishing."
          />
        </Label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <Tx
          k="host.import.note"
          source="Only publicly exposed information is imported. Generic websites may provide fewer details, and every imported field must be reviewed before publishing."
        />
      </p>
    </section>
  );
}
