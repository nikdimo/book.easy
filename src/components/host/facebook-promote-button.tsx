"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Loaded only once a host actually presses promote.
 *
 * The workspace pulls in a two-month calendar, the destination editor and the
 * promotion server actions. A listings page renders one of these buttons per card, and
 * none of that belongs in the bundle for a page whose usual visit promotes nothing.
 * `ssr: false` because the panel is behind a closed dialog that has no server render to
 * contribute to.
 */
const PromotionWorkspace = dynamic(
  () =>
    import("@/components/host/promotion/promotion-workspace").then(
      (module) => module.PromotionWorkspace,
    ),
  { ssr: false },
);

/**
 * The blue promotion control on a published listing.
 *
 * It used to be a link straight to Facebook's share composer, which shared the URL and
 * left the host to write the post from memory in a tab that no longer showed them the
 * property. It now opens the promotion workspace instead: the same one entry the public
 * property page uses, so a host meets one screen wherever they press promote.
 *
 * The workspace only mounts once the dialog is open. It loads a description, a
 * calendar and the host's saved groups, and a listings page with twenty cards must not
 * fetch that twenty times over.
 */
export function FacebookPromoteButton({
  listingId,
  title,
  compact = false,
  className,
}: {
  listingId: string;
  title: string;
  compact?: boolean;
  className?: string;
}) {
  const { resolve } = useI18n();
  const [open, setOpen] = useState(false);
  const label = interpolate(
    resolve("host.facebook_promote.label", "Promote {title} on Facebook"),
    { title },
  ).text;

  const control = compact ? (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-[#1877F2] transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1877F2]",
        className,
      )}
    >
      <Megaphone className="size-4" aria-hidden />
    </button>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("text-[#1877F2]", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <Megaphone className="size-4" aria-hidden />
      <Tx k="host.facebook_promote.action" source="Promote" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {compact ? (
        <DialogTrigger asChild>{control}</DialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{control}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            <Tx
              k="host.facebook_promote.tooltip"
              source="Prepare a post for Facebook — we write the text, you paste and post it."
            />
          </TooltipContent>
        </Tooltip>
      )}
      {/* A sheet that fills a phone, a wide centered dialog from `md` up. The shared
          `variant="sheet"` already switches between the two; the width override is here
          because the compose step puts the controls and the live preview side by side
          from `md`, and `max-w-2xl` gave each column about 320px — narrower than the
          post it was previewing. `max-w-4xl` is still inside the listing flow's own
          `max-w-5xl` step column, so the two read as the same width of screen.

          The panel itself scrolls nothing: it is a flex column whose middle scrolls, so
          the progress rail and the footer stay put while a step's content moves. */}
      <DialogContent
        variant="sheet"
        className="flex h-dvh !max-h-dvh flex-col gap-0 overflow-hidden rounded-none md:h-auto md:!max-h-[92dvh] md:max-w-4xl md:rounded-xl"
      >
        <PromotionWorkspace listingId={listingId} onOpenChange={setOpen} />
      </DialogContent>
    </Dialog>
  );
}
