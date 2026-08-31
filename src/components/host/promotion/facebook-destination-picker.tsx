"use client";

import * as React from "react";
import { Loader2, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { normalizeFacebookGroupUrl } from "@/lib/facebook-destinations";
import {
  createFacebookDestinationAction,
  deleteFacebookDestinationAction,
  updateFacebookDestinationAction,
} from "@/lib/actions/facebook-promotion.actions";
import type { HostFacebookDestinationView } from "@/lib/services/facebook-destination.service";
import { cn } from "@/lib/utils";

/**
 * The Facebook places a host is posting into, as a list they tick.
 *
 * Multi-select, which is the change that makes the whole wizard worth having: a host
 * with three local rental groups posts into all three, and the single-selection version
 * of this made them run the entire flow once per group. Their own profile is a row in
 * the same list rather than a separate concept — to the host it is simply a fourth
 * place the post goes.
 *
 * Nothing here is a Facebook integration. Linger Homes stores a name and a URL, and
 * later opens that URL in a tab. Saved groups belong to the host account rather than to
 * a property, so the same three groups are one setup for every listing they publish.
 *
 * A pasted link is saved rather than used once. The previous version allowed an
 * ephemeral "custom" destination alongside a single selection; with a list of ticked
 * places there is nowhere coherent for an unsaved one to live, and a group worth
 * posting into once is nearly always worth posting into again. Pasting still starts
 * here — the address goes into the field below and the save form opens with it filled.
 */

/** Past this many saved groups the list stops being scannable and earns a filter. */
const SEARCH_THRESHOLD = 6;

/** A shape, not copy — held in a constant so no translation pass ever rewrites the one
 *  thing in these fields that has to stay a literal facebook.com address. */
const GROUP_URL_EXAMPLE = "https://www.facebook.com/groups/…";

function useDestinationErrorMessage() {
  const { resolve } = useI18n();
  return React.useCallback(
    (code: string) => {
      switch (code) {
        case "DUPLICATE":
          return resolve(
            "host.promote.destination.error_duplicate",
            "You already saved that group.",
          ).text;
        case "INVALID_URL":
          return resolve(
            "host.promote.destination.error_invalid",
            "That is not a Facebook group link. It should look like facebook.com/groups/…",
          ).text;
        case "NAME_REQUIRED":
          return resolve(
            "host.promote.destination.error_name",
            "Give the group a name so you can recognise it later.",
          ).text;
        case "LIMIT_REACHED":
          return resolve(
            "host.promote.destination.error_limit",
            "You have saved as many groups as we keep. Remove one first.",
          ).text;
        case "NOT_FOUND":
          return resolve(
            "host.promote.destination.error_missing",
            "That group is no longer saved.",
          ).text;
        default:
          return resolve(
            "host.promote.destination.error_generic",
            "That could not be saved. Try again.",
          ).text;
      }
    },
    [resolve],
  );
}

export function FacebookDestinationPicker({
  destinations,
  onDestinationsChange,
  profileSelected,
  onProfileSelectedChange,
  selectedIds,
  onSelectedIdsChange,
}: {
  destinations: HostFacebookDestinationView[];
  onDestinationsChange: (next: HostFacebookDestinationView[]) => void;
  profileSelected: boolean;
  onProfileSelectedChange: (next: boolean) => void;
  selectedIds: string[];
  onSelectedIdsChange: (next: string[]) => void;
}) {
  const { resolve } = useI18n();
  const errorMessage = useDestinationErrorMessage();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [pastedUrl, setPastedUrl] = React.useState("");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return destinations;
    return destinations.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.url.toLowerCase().includes(needle),
    );
  }, [destinations, query]);

  function toggleSelected(id: string, checked: boolean) {
    onSelectedIdsChange(
      checked
        ? [...selectedIds.filter((value) => value !== id), id]
        : selectedIds.filter((value) => value !== id),
    );
  }

  async function toggleFavorite(destination: HostFacebookDestinationView) {
    let result;
    try {
      result = await updateFacebookDestinationAction(destination.id, {
        favorite: !destination.favorite,
      });
    } catch {
      toast.error(errorMessage("GENERIC"));
      return;
    }
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return;
    }
    // Re-sorted the way the server orders them, so a newly starred group jumps to the
    // top immediately instead of after the next dialog open.
    onDestinationsChange(
      destinations
        .map((item) => (item.id === result.data.id ? result.data : item))
        .sort(
          (a, b) =>
            Number(b.favorite) - Number(a.favorite) ||
            (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""),
        ),
    );
  }

  async function remove(destination: HostFacebookDestinationView) {
    let result;
    try {
      result = await deleteFacebookDestinationAction(destination.id);
    } catch {
      toast.error(errorMessage("GENERIC"));
      return;
    }
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return;
    }
    onDestinationsChange(
      destinations.filter((item) => item.id !== destination.id),
    );
    onSelectedIdsChange(selectedIds.filter((id) => id !== destination.id));
  }

  const pasted = pastedUrl.trim() ? normalizeFacebookGroupUrl(pastedUrl) : null;

  return (
    <div className="min-w-0">
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        <li className="flex items-center gap-3 py-2.5">
          <Checkbox
            id="promotion-destination-profile"
            checked={profileSelected}
            onCheckedChange={(checked) => onProfileSelectedChange(checked === true)}
          />
          <Label
            htmlFor="promotion-destination-profile"
            className="min-w-0 flex-1 cursor-pointer text-sm font-normal text-slate-900"
          >
            <Tx k="host.promote.destination.profile" source="My Facebook profile" />
          </Label>
        </li>

        {filtered.map((destination) =>
          editing === destination.id ? (
            <li key={destination.id} className="py-2.5">
              <DestinationForm
                initialName={destination.name}
                initialUrl={destination.url}
                submitLabel={
                  resolve("host.promote.destination.save_changes", "Save changes").text
                }
                onCancel={() => setEditing(null)}
                onSubmit={async (name, url) => {
                  const result = await updateFacebookDestinationAction(
                    destination.id,
                    { name, url },
                  );
                  if (!result.ok) return errorMessage(result.error);
                  onDestinationsChange(
                    destinations.map((item) =>
                      item.id === result.data.id ? result.data : item,
                    ),
                  );
                  setEditing(null);
                  return null;
                }}
              />
            </li>
          ) : (
            <li key={destination.id} className="flex items-center gap-2 py-2.5">
              <Checkbox
                id={`promotion-destination-${destination.id}`}
                checked={selectedIds.includes(destination.id)}
                onCheckedChange={(checked) =>
                  toggleSelected(destination.id, checked === true)
                }
              />
              <Label
                htmlFor={`promotion-destination-${destination.id}`}
                className="min-w-0 flex-1 cursor-pointer font-normal"
              >
                <span
                  className="block truncate text-sm text-slate-900"
                  data-user-generated-content
                  translate="yes"
                >
                  {destination.name}
                </span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void toggleFavorite(destination)}
                aria-label={
                  destination.favorite
                    ? interpolate(
                        resolve(
                          "host.promote.destination.unfavorite_label",
                          "Unpin {name} from the top",
                        ),
                        { name: destination.name },
                      ).text
                    : interpolate(
                        resolve(
                          "host.promote.destination.favorite_label",
                          "Pin {name} to the top",
                        ),
                        { name: destination.name },
                      ).text
                }
                aria-pressed={destination.favorite}
              >
                <Star
                  className={cn(
                    "size-4",
                    destination.favorite && "fill-amber-400 text-amber-500",
                  )}
                  aria-hidden
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditing(destination.id)}
                aria-label={
                  interpolate(
                    resolve("host.promote.destination.rename_label", "Rename {name}"),
                    { name: destination.name },
                  ).text
                }
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void remove(destination)}
                aria-label={
                  interpolate(
                    resolve("host.promote.destination.remove_label", "Remove {name}"),
                    { name: destination.name },
                  ).text
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ),
        )}
      </ul>

      {destinations.length > SEARCH_THRESHOLD && (
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={
              resolve("host.promote.destination.search", "Search saved groups").text
            }
            placeholder={
              resolve("host.promote.destination.search", "Search saved groups").text
            }
          />
        </div>
      )}

      {destinations.length > 0 && filtered.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          <Tx
            k="host.promote.destination.no_matches"
            source="No saved group matches that search."
          />
        </p>
      )}

      {adding ? (
        <div className="mt-3">
          <DestinationForm
            initialName=""
            initialUrl={pasted?.ok ? pasted.url : ""}
            submitLabel={resolve("host.promote.destination.save", "Save group").text}
            onCancel={() => setAdding(false)}
            onSubmit={async (name, url) => {
              const result = await createFacebookDestinationAction({ name, url });
              if (!result.ok) return errorMessage(result.error);
              onDestinationsChange([result.data, ...destinations]);
              // Saved from inside the flow means the host is posting there now.
              onSelectedIdsChange([...selectedIds, result.data.id]);
              setAdding(false);
              setPastedUrl("");
              return null;
            }}
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={pastedUrl}
            onChange={(event) => setPastedUrl(event.target.value)}
            aria-label={
              resolve("host.promote.destination.custom_label", "Facebook group link")
                .text
            }
            placeholder={GROUP_URL_EXAMPLE}
            inputMode="url"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" aria-hidden />
            <Tx k="host.promote.destination.add" source="Save a Facebook group" />
          </Button>
        </div>
      )}

      {pasted && !pasted.ok && (
        <p className="mt-2 text-xs text-destructive">
          <Tx
            k="host.promote.destination.error_invalid"
            source="That is not a Facebook group link. It should look like facebook.com/groups/…"
          />
        </p>
      )}
    </div>
  );
}

/** Add or rename, sharing one form because the fields and the validation are the
 *  same. Errors are shown in place rather than as a toast: the field that has to
 *  change is right here. */
function DestinationForm({
  initialName,
  initialUrl,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  initialUrl: string;
  submitLabel: string;
  onSubmit: (name: string, url: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { resolve } = useI18n();
  const nameId = React.useId();
  const urlId = React.useId();
  const [name, setName] = React.useState(initialName);
  const [url, setUrl] = React.useState(initialUrl);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>
          <Tx k="host.promote.destination.name" source="Group name" />
        </Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={urlId}>
          <Tx k="host.promote.destination.url" source="Group link" />
        </Label>
        <Input
          id={urlId}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={GROUP_URL_EXAMPLE}
          inputMode="url"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <Tx k="host.promote.destination.cancel" source="Cancel" />
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              setError(await onSubmit(name, url));
            } catch {
              setError(
                resolve(
                  "host.promote.destination.error_generic",
                  "That could not be saved. Try again.",
                ).text,
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
      <p className="sr-only">
        {resolve(
          "host.promote.destination.form_hint",
          "Paste the group address from your browser. Only facebook.com group links can be saved.",
        ).text}
      </p>
    </div>
  );
}
