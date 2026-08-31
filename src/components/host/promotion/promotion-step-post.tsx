"use client";

import * as React from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  FlowSectionLabel,
  FlowStepHeading,
} from "@/components/host/flow-chrome";
import { InfoSheet } from "@/components/host/v2/listings/info-sheet";
import { ChannelName } from "@/components/host/promotion/promotion-step-where";
import { copyTextRobustly } from "@/lib/clipboard";
import {
  MESSAGING_APPS,
  messagingShareUrl,
  type MessagingApp,
  type PromotionChannel,
} from "@/lib/promotion/channels";

/**
 * Step three: the handover.
 *
 * One row per place, grouped by app, and the window stays open until they are all done.
 * The old workspace closed itself the moment a host clicked through to Facebook, so a
 * profile and three groups meant running the whole flow four times.
 *
 * Every outbound control is a real anchor, and its click both copies and navigates.
 * That is possible only because the dates were re-checked on the way into this step:
 * `copyTextRobustly` opens with a synchronous `execCommand`, which survives the tab
 * opening, but any `await` before it would spend the user activation both mechanisms
 * depend on. The previous version awaited an availability check inside the copy, which
 * is exactly why it had to offer Copy and Open as two separate presses and then explain
 * the order in a dashed box.
 *
 * Copying on every press rather than once at the top: it costs nothing, and it is the
 * only version that is still correct after a host has copied something else in another
 * tab halfway through.
 */

export type PromotionTarget =
  | { kind: "facebook-profile"; id: string; name: string; url: string }
  | { kind: "facebook-group"; id: string; name: string; url: string };

export function PromotionStepPost({
  channels,
  facebookTargets,
  facebookText,
  instagramCaption,
  messagingText,
  propertyUrl,
  savedMediaCount,
  needsMedia,
  done,
  onDone,
  onGroupOpened,
}: {
  channels: PromotionChannel[];
  facebookTargets: PromotionTarget[];
  facebookText: string;
  instagramCaption: string;
  messagingText: string;
  propertyUrl: string;
  savedMediaCount: number;
  /** True when Instagram is among the channels and no file has been saved yet. */
  needsMedia: boolean;
  done: string[];
  onDone: (key: string) => void;
  onGroupOpened: (destinationId: string) => void;
}) {
  const { resolve } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const infoTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  const helpLabel = resolve(
    "host.promote.post.help",
    "Why we cannot post for you",
  ).text;

  function handOver(text: string, key: string, destinationId?: string) {
    // Synchronous on purpose — see the note at the top of this file.
    void copyTextRobustly(text);
    setCopied(true);
    onDone(key);
    if (destinationId) onGroupOpened(destinationId);
  }

  async function copyOnly(text: string, key: string) {
    const ok = await copyTextRobustly(text);
    if (!ok) {
      toast.error(
        resolve(
          "host.promote.copy_failed",
          "The text could not be copied. Select it in the box and copy it manually.",
        ).text,
      );
      return;
    }
    setCopied(true);
    onDone(key);
    toast.success(
      resolve(
        "host.promote.copied",
        "Post text copied. Paste it into Facebook with Ctrl+V.",
      ).text,
    );
  }

  return (
    <>
      <FlowStepHeading
        title={<Tx k="host.promote.post.heading_step" source="Post it yourself" />}
        helpLabel={helpLabel}
        onHelp={() => setInfoOpen(true)}
        helpRef={infoTriggerRef}
      />

      {channels.includes("FACEBOOK") && facebookTargets.length > 0 ? (
        <section className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <FlowSectionLabel className="flex-1">
              <Tx k="host.promote.channel.facebook" source="Facebook" />
            </FlowSectionLabel>
            {copied ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Check className="size-3.5" aria-hidden />
                <Tx
                  k="host.promote.post.copied_paste"
                  source="Text copied — paste with Ctrl+V"
                />
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {facebookTargets.map((target) => (
              <TargetRow
                key={target.id}
                name={
                  target.kind === "facebook-profile" ? (
                    <Tx
                      k="host.promote.destination.profile"
                      source="My Facebook profile"
                    />
                  ) : (
                    <span data-user-generated-content translate="yes">
                      {target.name}
                    </span>
                  )
                }
                href={target.url}
                done={done.includes(target.id)}
                onOpen={() =>
                  handOver(
                    facebookText,
                    target.id,
                    target.kind === "facebook-group" ? target.id : undefined,
                  )
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      {channels.includes("INSTAGRAM") ? (
        <section className="mt-5">
          <FlowSectionLabel className="mb-2">
            <Tx k="host.promote.channel.instagram" source="Instagram" />
          </FlowSectionLabel>
          {needsMedia ? (
            <p className="mb-2 text-xs leading-5 text-amber-700">
              <Tx
                k="host.promote.post.instagram_needs_media"
                source="Instagram needs a photo from your device. Go back and save one first."
              />
            </p>
          ) : savedMediaCount > 0 ? (
            <p className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Check className="size-3.5" aria-hidden />
              {
                interpolate(
                  resolve(
                    "host.promote.post.instagram_media_ready",
                    "{count} saved to your device",
                  ),
                  { count: savedMediaCount },
                ).text
              }
            </p>
          ) : null}
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            <li className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 text-sm text-slate-900">
                <Tx k="host.promote.post.instagram_caption" source="Caption" />
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyOnly(instagramCaption, "instagram-caption")}
              >
                <Copy className="size-4" aria-hidden />
                <Tx k="host.promote.copy" source="Copy text" />
              </Button>
            </li>
            <TargetRow
              name={<Tx k="host.promote.channel.instagram" source="Instagram" />}
              href="https://www.instagram.com/"
              done={done.includes("instagram-open")}
              onOpen={() => onDone("instagram-open")}
            />
          </ul>
        </section>
      ) : null}

      {channels.includes("MESSAGING") ? (
        <section className="mt-5">
          <FlowSectionLabel className="mb-2">
            <ChannelName channel="MESSAGING" />
          </FlowSectionLabel>
          <p className="mb-2 text-xs leading-5 text-slate-500">
            <Tx
              k="host.promote.post.messaging_note"
              source="The whole message travels in the link — nothing to copy."
            />
          </p>
          <div className="flex flex-wrap gap-2">
            {MESSAGING_APPS.map((app) => (
              <Button key={app} asChild variant="outline" size="sm">
                <a
                  href={messagingShareUrl(app, messagingText, propertyUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onDone(`messaging-${app}`)}
                >
                  <ExternalLink className="size-4" aria-hidden />
                  <MessagingAppName app={app} />
                </a>
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {channels.includes("LINK") ? (
        <section className="mt-5">
          <FlowSectionLabel className="mb-2">
            <ChannelName channel="LINK" />
          </FlowSectionLabel>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyOnly(propertyUrl, "link")}
          >
            <Copy className="size-4" aria-hidden />
            <Tx k="host.promote.post.copy_link" source="Copy the property link" />
          </Button>
        </section>
      ) : null}

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={helpLabel}
        returnFocusTo={infoTriggerRef}
      >
        <div className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            <Tx
              k="host.promote.post.help_body"
              source="No app lets another website post for you, and we would not ask for that access. We write the post, copy it and open the page — you paste it and press post."
            />
          </p>
          <p>
            <Tx
              k="host.promote.post.help_groups"
              source="Groups open one at a time: browsers block a site that opens several tabs at once, and you have to post in each one anyway."
            />
          </p>
        </div>
      </InfoSheet>
    </>
  );
}

/** A place to post, and the one press that copies the text and opens it. */
function TargetRow({
  name,
  href,
  done,
  onOpen,
}: {
  name: React.ReactNode;
  href: string;
  done: boolean;
  onOpen: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      {done ? (
        <Check className="size-4 shrink-0 text-slate-900" aria-hidden />
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm text-slate-900",
          !done && "pl-7",
        )}
      >
        {name}
      </span>
      <Button asChild variant="outline" size="sm">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
        >
          <ExternalLink className="size-4" aria-hidden />
          {done ? (
            <Tx k="host.promote.post.open_again" source="Open again" />
          ) : (
            <Tx k="host.promote.post.open" source="Open" />
          )}
        </a>
      </Button>
    </li>
  );
}

/** Names, not codes — and written out so the extractor sees each key. */
function MessagingAppName({ app }: { app: MessagingApp }) {
  switch (app) {
    case "WHATSAPP":
      return <Tx k="host.promote.messaging.whatsapp" source="WhatsApp" />;
    case "VIBER":
      return <Tx k="host.promote.messaging.viber" source="Viber" />;
    case "TELEGRAM":
      return <Tx k="host.promote.messaging.telegram" source="Telegram" />;
  }
}
