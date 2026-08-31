"use client";

import * as React from "react";
import { Loader2, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
 * Where the host is going to paste the post.
 *
 * Three kinds, and only three: their own Facebook profile, a group they saved once and
 * reuse everywhere, or a group link they are pasting for the first time and may not
 * want to keep. Nothing here is a Facebook integration — Linger Homes stores a name and
 * a URL, and opens that URL in a tab.
 *
 * Saved groups belong to the host account rather than to a property, so the same three
 * local rental groups are one setup for every listing they will ever publish.
 */

/** The one selection shape the workspace acts on. `profile` needs no id; `custom`
 *  carries a URL the host has not saved. */
export type PromotionDestination =
  | { kind: "profile" }
  | { kind: "saved"; id: string; name: string; url: string }
  | { kind: "custom"; url: string };

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
  value,
  onChange,
}: {
  destinations: HostFacebookDestinationView[];
  onDestinationsChange: (next: HostFacebookDestinationView[]) => void;
  value: PromotionDestination;
  onChange: (next: PromotionDestination) => void;
}) {
  const { resolve } = useI18n();
  const errorMessage = useDestinationErrorMessage();
  const groupName = React.useId();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [customUrl, setCustomUrl] = React.useState("");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return destinations;
    return destinations.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.url.toLowerCase().includes(needle),
    );
  }, [destinations, query]);

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
    onDestinationsChange(destinations.filter((item) => item.id !== destination.id));
    if (value.kind === "saved" && value.id === destination.id) {
      onChange({ kind: "profile" });
    }
  }

  const customResult = customUrl.trim()
    ? normalizeFacebookGroupUrl(customUrl)
    : null;

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium">
        <Tx k="host.promote.destination.legend" source="Where do you want to post?" />
      </legend>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-[#1877F2] has-checked:bg-[#1877F2]/5">
        <input
          type="radio"
          name={groupName}
          className="size-4 accent-[#1877F2]"
          checked={value.kind === "profile"}
          onChange={() => onChange({ kind: "profile" })}
        />
        <span className="text-sm font-medium">
          <Tx k="host.promote.destination.profile" source="My Facebook profile" />
        </span>
      </label>

      {destinations.length > SEARCH_THRESHOLD && (
        <div className="relative">
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

      <ul className="space-y-2">
        {filtered.map((destination) => (
          <li key={destination.id}>
            {editing === destination.id ? (
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
                  if (value.kind === "saved" && value.id === result.data.id) {
                    onChange({
                      kind: "saved",
                      id: result.data.id,
                      name: result.data.name,
                      url: result.data.url,
                    });
                  }
                  setEditing(null);
                  return null;
                }}
              />
            ) : (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2 pl-3",
                  value.kind === "saved" &&
                    value.id === destination.id &&
                    "border-[#1877F2] bg-[#1877F2]/5",
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name={groupName}
                    className="size-4 shrink-0 accent-[#1877F2]"
                    checked={value.kind === "saved" && value.id === destination.id}
                    onChange={() =>
                      onChange({
                        kind: "saved",
                        id: destination.id,
                        name: destination.name,
                        url: destination.url,
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span
                      className="block truncate text-sm font-medium"
                      data-user-generated-content
                      translate="yes"
                    >
                      {destination.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground" translate="no">
                      {destination.url}
                    </span>
                  </span>
                </label>
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
              </div>
            )}
          </li>
        ))}
      </ul>

      {destinations.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          <Tx
            k="host.promote.destination.no_matches"
            source="No saved group matches that search."
          />
        </p>
      )}

      {/* A group the host is opening once. It is not saved, so it never joins the list
          above and never has to be cleaned up. */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-[#1877F2] has-checked:bg-[#1877F2]/5">
        <input
          type="radio"
          name={groupName}
          className="mt-0.5 size-4 accent-[#1877F2]"
          checked={value.kind === "custom"}
          onChange={() =>
            onChange({ kind: "custom", url: customResult?.ok ? customResult.url : "" })
          }
        />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="block text-sm font-medium">
            <Tx
              k="host.promote.destination.custom"
              source="Paste another group link"
            />
          </span>
          <Input
            value={customUrl}
            onChange={(event) => {
              setCustomUrl(event.target.value);
              const parsed = normalizeFacebookGroupUrl(event.target.value);
              onChange({ kind: "custom", url: parsed.ok ? parsed.url : "" });
            }}
            aria-label={
              resolve(
                "host.promote.destination.custom_label",
                "Facebook group link",
              ).text
            }
            placeholder={GROUP_URL_EXAMPLE}
          />
          {customResult && !customResult.ok && (
            <span className="block text-xs text-destructive">
              <Tx
                k="host.promote.destination.error_invalid"
                source="That is not a Facebook group link. It should look like facebook.com/groups/…"
              />
            </span>
          )}
        </span>
      </label>

      {adding ? (
        <DestinationForm
          initialName=""
          initialUrl={customResult?.ok ? customResult.url : ""}
          submitLabel={resolve("host.promote.destination.save", "Save group").text}
          onCancel={() => setAdding(false)}
          onSubmit={async (name, url) => {
            const result = await createFacebookDestinationAction({ name, url });
            if (!result.ok) return errorMessage(result.error);
            onDestinationsChange([result.data, ...destinations]);
            onChange({
              kind: "saved",
              id: result.data.id,
              name: result.data.name,
              url: result.data.url,
            });
            setAdding(false);
            return null;
          }}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" aria-hidden />
          <Tx k="host.promote.destination.add" source="Save a Facebook group" />
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        <Tx
          k="host.promote.destination.privacy"
          source="Private groups are fine. We only store the name and the link, and open it in a new tab — we never read the group or post for you."
        />
      </p>
    </fieldset>
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
