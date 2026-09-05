"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { ArrivalGuideCards } from "@/components/host/v2/editor/arrival-guide/arrival-guide-cards";
import {
  CheckInMethodEditor,
  CheckoutInstructionsEditor,
  DirectionsEditor,
  GuidebooksEditor,
  HouseManualEditor,
  InteractionEditor,
  WifiEditor,
  type EditorProps,
} from "@/components/host/v2/editor/arrival-guide/arrival-guide-editors";
import {
  CheckInCheckoutEditor,
  HouseRulesPane,
} from "@/components/host/v2/editor/arrival-guide/arrival-guide-stay-editors";
import { beginSave, endSave } from "@/components/host/v2/editor/save-state";
import { updateListingArrivalGuide } from "@/lib/actions/listing-arrival-guide.actions";
import { updateListingHouseRules } from "@/lib/actions/listing-house-rules.actions";
import {
  DEFAULT_ARRIVAL_TOPIC,
  sameCheckoutInstructions,
  type ListingArrivalGuideInput,
} from "@/lib/host/v2/listing-arrival-guide";
import {
  listingHouseRulesIssues,
  sameListingHouseRules,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import { EDITOR_LEFT_COLUMN_CLASS } from "@/lib/host/v2/editor-layout";
import { listingPreviewable } from "@/lib/host/v2/listing-status";
import { useI18n } from "@/lib/i18n/client";

/**
 * The Arrival guide section, in Airbnb's two-pane shape.
 *
 * This route is the one place in the editor that does not render `EditorFrame`. The section
 * rail is replaced by the card list, because on Airbnb the card list *is* the left column
 * here and a third column of section links beside it would leave the detail pane about
 * 700px wide on a laptop. The way back to the rest of the editor is the halves toggle above
 * this component — see `EditorHalves`, which wraps both halves so the switch is on both.
 *
 * All nine cards share one piece of state and one save. That is what makes switching cards
 * free — a half-typed door code survives a look at the house manual — and it is why the
 * cards are intercepted anchors rather than route links: a server navigation would remount
 * this component and take the unsaved edit with it.
 *
 * Two writers, not one, and deliberately: the seven cards that own arrival-guide columns go
 * through `updateListingArrivalGuide`, while the two that show stay times and house rules
 * go through `updateListingHouseRules` — the same action the House rules section uses. The
 * alternative was a second writer for `Listing.checkInTime`, which is exactly the drift
 * this codebase avoids everywhere else.
 */
export function ArrivalGuideSection({
  listingId,
  slug,
  status,
  topic: initialTopic,
  guide: initialGuide,
  rules: initialRules,
  largestUpcomingParty,
}: {
  listingId: string;
  slug: string;
  status: string;
  /** The card in the URL, or null on the section's own root — which is the list on a
   *  phone and the first card on a desktop, exactly as Airbnb opens. */
  topic: string | null;
  guide: ListingArrivalGuideInput;
  rules: ListingHouseRulesInput;
  largestUpcomingParty: number;
}) {
  const { resolve } = useI18n();

  const [topic, setTopic] = useState<string | null>(initialTopic);
  const [guide, setGuide] = useState(initialGuide);
  const [rules, setRules] = useState(initialRules);
  const [saving, setSaving] = useState(false);

  /**
   * The last values the server confirmed — what "is there anything to save" compares
   * against, and what a refused save reverts to.
   *
   * State rather than refs, even though nothing renders them directly. Every Save button
   * on the section is enabled by comparing the live values against these, so a render that
   * read them out of a ref would be a render React had no reason to repeat: the button
   * would still say "Save" after a save had already succeeded.
   */
  const [confirmedGuide, setConfirmedGuide] = useState(initialGuide);
  const [confirmedRules, setConfirmedRules] = useState(initialRules);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const href = useCallback(
    (slugName: string) => `/host/listings/${listingId}/arrival-guide/${slugName}`,
    [listingId],
  );

  /**
   * Switching cards without leaving the page.
   *
   * `pushState` rather than a router navigation, for the state reason above. The URL is
   * still real: a refresh, a bookmark or a shared link lands on the same card, because the
   * route behind it renders that card server-side.
   */
  const select = useCallback(
    (next: string) => {
      setTopic(next);
      window.history.pushState(null, "", href(next));
    },
    [href],
  );

  // Back and forward move between cards rather than out of the section, which is what a
  // host who has clicked through four of them expects the back button to do.
  useEffect(() => {
    const onPop = () => {
      const segments = window.location.pathname.split("/").filter(Boolean);
      const index = segments.indexOf("arrival-guide");
      setTopic(index === -1 ? null : (segments[index + 1] ?? null));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const guideDirty = useCallback(
    (field: keyof ListingArrivalGuideInput) =>
      field === "checkoutInstructions"
        ? !sameCheckoutInstructions(
            guide.checkoutInstructions,
            confirmedGuide.checkoutInstructions,
          )
        : guide[field] !== confirmedGuide[field],
    [confirmedGuide, guide],
  );

  /**
   * Whether the card on screen has something to save.
   *
   * Per card rather than per section, which is Airbnb's behaviour and the readable one: a
   * Save button that lights up because of something typed on another screen is a button
   * the host cannot account for. The *write* is still the whole section — see the action,
   * where all the fields travel together — so nothing typed on another card is lost when
   * this one is saved; it is simply saved too.
   */
  const rulesDirty = !sameListingHouseRules(rules, confirmedRules);
  const dirtyFor = (slugName: string | null): boolean => {
    switch (slugName) {
      case "directions":
        return guideDirty("directions");
      case "check-in-method":
        return guideDirty("checkInMethod") || guideDirty("checkInMethodInstructions");
      case "wifi-details":
        return guideDirty("wifiNetwork") || guideDirty("wifiPassword");
      case "house-manual":
        return guideDirty("houseManual");
      case "checkout-instructions":
        return guideDirty("checkoutInstructions");
      case "interaction-preferences":
        return guideDirty("interactionPreference");
      case "house-rules":
      case "check-in-checkout":
      case null:
        return rulesDirty;
      default:
        return false;
    }
  };

  // The one thing a client cannot recover from: a host who closes the tab on an unsaved
  // door code. Only armed while something really is unsaved, so it never nags.
  const anythingUnsaved =
    rulesDirty ||
    (
      [
        "directions",
        "checkInMethod",
        "checkInMethodInstructions",
        "wifiNetwork",
        "wifiPassword",
        "houseManual",
        "checkoutInstructions",
        "interactionPreference",
      ] as (keyof ListingArrivalGuideInput)[]
    ).some(guideDirty);

  useEffect(() => {
    if (!anythingUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anythingUnsaved]);

  const failed = useCallback(
    (message?: string) => {
      toast.error(
        message ??
          resolve(
            "host.editor.arrival.save_failed",
            "We couldn't save that. Check your connection and try again.",
          ).text,
      );
    },
    [resolve],
  );

  const saveGuide = useCallback(async () => {
    setSaving(true);
    beginSave();
    try {
      const result = await updateListingArrivalGuide(listingId, guide);
      if (result.error || result.issues) {
        endSave(true);
        if (!mounted.current) return;
        failed(
          result.error ??
            resolve(
              "host.editor.arrival.save_rejected",
              "That couldn't be saved. Your listing still shows what it showed before.",
            ).text,
        );
        // Snap back to what the server confirmed. A control left showing a change that was
        // never stored is the one failure a host would never notice.
        setGuide(confirmedGuide);
        return;
      }
      const stored = result.guide ?? guide;
      if (mounted.current) {
        setConfirmedGuide(stored);
        setGuide(stored);
      }
      endSave();
    } catch {
      // Deliberately *not* reverted. A refusal above means the server has looked at these
      // values and will not have them, so showing them back would be a lie; a thrown
      // request means nobody looked at all — the connection dropped — and throwing away a
      // paragraph the host just wrote because their train went into a tunnel would be the
      // worse failure by far. The values stay on screen, still dirty, still saveable.
      endSave(true);
      if (mounted.current) failed();
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [confirmedGuide, failed, guide, listingId, resolve]);

  const saveRules = useCallback(async () => {
    // Refused here rather than at the server, so the host is told which row is wrong while
    // they can still see it — quiet hours with one end blank is the case that matters.
    if (Object.keys(listingHouseRulesIssues(rules)).length > 0) {
      failed(
        resolve(
          "host.editor.arrival.rules_incomplete",
          "Some of your house rules are incomplete. Check the rows marked below.",
        ).text,
      );
      return;
    }
    setSaving(true);
    beginSave();
    try {
      const result = await updateListingHouseRules(listingId, rules);
      if (result.error || result.issues) {
        endSave(true);
        if (!mounted.current) return;
        failed(result.error);
        setRules(confirmedRules);
        return;
      }
      const stored = result.rules ?? rules;
      if (mounted.current) {
        setConfirmedRules(stored);
        setRules(stored);
      }
      endSave();
    } catch {
      // Kept on screen rather than reverted, for the reason given in `saveGuide`.
      endSave(true);
      if (mounted.current) failed();
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [confirmedRules, failed, listingId, resolve, rules]);

  const editorProps: EditorProps = {
    guide,
    onChange: setGuide,
    dirty: dirtyFor(topic),
    saving,
    onSave: saveGuide,
  };
  const stayProps = {
    rules,
    onChange: setRules,
    dirty: rulesDirty,
    saving,
    onSave: saveRules,
  };

  const shown = topic ?? DEFAULT_ARRIVAL_TOPIC;
  const detail = (() => {
    switch (shown) {
      case "directions":
        return <DirectionsEditor {...editorProps} />;
      case "check-in-method":
        return <CheckInMethodEditor {...editorProps} />;
      case "wifi-details":
        return <WifiEditor {...editorProps} />;
      case "house-manual":
        return <HouseManualEditor {...editorProps} />;
      case "checkout-instructions":
        return <CheckoutInstructionsEditor {...editorProps} />;
      case "interaction-preferences":
        return <InteractionEditor {...editorProps} />;
      case "guidebooks":
        return <GuidebooksEditor listingId={listingId} />;
      case "house-rules":
        return (
          <HouseRulesPane
            {...stayProps}
            largestUpcomingParty={largestUpcomingParty}
            onOpenStayTimes={() => select("check-in-checkout")}
          />
        );
      default:
        return <CheckInCheckoutEditor {...stayProps} />;
    }
  })();

  const canPreview = listingPreviewable(status);

  return (
    <div className="arrival-guide flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Left column. Below `lg` it is the whole screen until a card is opened, which is
          how Airbnb behaves on a phone: a list, then the thing you tapped. */}
      <div
        className={`relative min-w-0 flex-col lg:flex lg:min-h-0 ${EDITOR_LEFT_COLUMN_CLASS} ${
          topic === null ? "flex flex-1" : "hidden"
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-28 pt-6 lg:pb-32">
          <div className="mx-auto w-full max-w-[420px] lg:max-w-none">
            <ArrivalGuideCards
              href={href}
              current={shown}
              guide={guide}
              rules={rules}
              onSelect={select}
            />
          </div>
        </div>

        {/* Airbnb's floating View pill, centred over the bottom of the list column. Only
            for a listing that has a public page to look at. */}
        {canPreview && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
            <Link
              href={`/properties/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="ag-elevated pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[var(--ag-hof)] px-5 py-2.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Eye className="size-4" aria-hidden />
              {resolve("host.editor.arrival.view", "View").text}
            </Link>
          </div>
        )}
      </div>

      {/* Right column. Below `lg` it replaces the list, with its own way back. */}
      <div
        className={`min-w-0 flex-1 flex-col ${topic === null ? "hidden lg:flex" : "flex"}`}
      >
        <div className="shrink-0 px-6 pt-6 lg:hidden">
          <button
            type="button"
            onClick={() => {
              setTopic(null);
              window.history.pushState(
                null,
                "",
                `/host/listings/${listingId}/arrival-guide`,
              );
            }}
            className="inline-flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {resolve("host.editor.arrival.back_to_list", "Arrival guide").text}
          </button>
        </div>
        {detail}
      </div>
    </div>
  );
}
