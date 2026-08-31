"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Download, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  FlowHelpButton,
  FlowSectionLabel,
} from "@/components/host/flow-chrome";
import { InfoSheet } from "@/components/host/v2/listings/info-sheet";
import { saveListingMedia } from "@/lib/promotion/media-download";
import type { PromotionMediaItem } from "@/lib/services/listing-promotion.service";

/**
 * The listing's own photos, so a host never has to go and find them.
 *
 * Two quite different jobs, which is why one control serves both. Instagram cannot be
 * posted without a file in hand, and this is the only place to get one. Facebook needs
 * no file at all — the link card already carries the cover — but a group post with
 * three real photos outperforms a link card, at the price of the card: Facebook renders
 * attachments or a preview, never both. That trade-off is the whole content of the
 * question mark beside this label, and it is why saving is offered rather than done.
 */
export function PromotionMediaPicker({
  media,
  slug,
  selectedIds,
  onSelectedIdsChange,
  onSaved,
}: {
  media: PromotionMediaItem[];
  slug: string;
  selectedIds: string[];
  onSelectedIdsChange: (next: string[]) => void;
  /** Told when files actually reached the device, so the posting step can say so. */
  onSaved: (count: number) => void;
}) {
  const { resolve } = useI18n();
  const [saving, setSaving] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const infoTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  const helpLabel = resolve(
    "host.promote.media.help",
    "Photos, and what Facebook does with them",
  ).text;

  if (media.length === 0) return null;

  const selected = media.filter((item) => selectedIds.includes(item.id));

  function toggle(id: string) {
    onSelectedIdsChange(
      selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : [...selectedIds, id],
    );
  }

  async function save() {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    try {
      const outcome = await saveListingMedia(
        selected.map((item) => item.url),
        slug,
      );
      if (outcome.kind === "failed") {
        toast.error(
          resolve(
            "host.promote.media.save_failed",
            "Those files could not be saved. Open the listing and save them from the gallery instead.",
          ).text,
        );
        return;
      }
      onSaved(selected.length);
      toast.success(
        interpolate(
          resolve("host.promote.media.saved", "{count} saved to your device."),
          { count: selected.length },
        ).text,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <FlowSectionLabel className="flex-1">
          <Tx k="host.promote.media.heading" source="Photos and video" />
        </FlowSectionLabel>
        <FlowHelpButton
          label={helpLabel}
          onClick={() => setInfoOpen(true)}
          buttonRef={infoTriggerRef}
        />
      </div>

      {/* Scrolls sideways rather than wrapping: a strip keeps its height predictable on
          a narrow screen, where a grid of twelve would push the preview off the step. */}
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {media.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                aria-label={
                  interpolate(
                    resolve(
                      "host.promote.media.item_label",
                      "Include photo {number} in what you save",
                    ),
                    { number: media.indexOf(item) + 1 },
                  ).text
                }
                onClick={() => toggle(item.id)}
                className={cn(
                  "relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2",
                  isSelected && "ring-2 ring-slate-950 ring-offset-2",
                )}
              >
                {item.mediaType === "IMAGE" ? (
                  <Image
                    src={item.url}
                    alt=""
                    width={64}
                    height={64}
                    className="size-full object-cover"
                  />
                ) : (
                  <Play className="size-5 text-slate-500" aria-hidden />
                )}
                {isSelected ? (
                  <span
                    className="absolute left-1 top-1 grid size-4 place-items-center rounded-[5px] bg-slate-950 text-white"
                    aria-hidden
                  >
                    <Check className="size-3" />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={selected.length === 0 || saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {
            interpolate(
              resolve("host.promote.media.save", "Save {count}"),
              { count: selected.length },
            ).text
          }
        </Button>
        <span className="text-xs leading-5 text-slate-500">
          <Tx
            k="host.promote.media.hint"
            source="Attach them yourself for a stronger post."
          />
        </span>
      </div>

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={helpLabel}
        returnFocusTo={infoTriggerRef}
      >
        <div className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            <Tx
              k="host.promote.media.help_facebook"
              source="Facebook already shows your cover photo in the link preview. Attach photos and it shows those instead, and your link becomes plain text — often worth it in a group, where photos are what people stop for."
            />
          </p>
          <p>
            <Tx
              k="host.promote.media.help_instagram"
              source="Instagram needs a file. Save the photos here, then pick them from your gallery in the app."
            />
          </p>
          <p>
            <Tx
              k="host.promote.media.help_saving"
              source="Saving several at once makes your browser ask permission. On an iPhone, choose Save to Photos in the share sheet."
            />
          </p>
        </div>
      </InfoSheet>
    </>
  );
}
