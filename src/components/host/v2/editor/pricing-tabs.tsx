"use client";

import { useId, useRef, useState } from "react";

/**
 * The two halves of what a listing charges: the price, and what comes off it.
 *
 * Pricing was one column of four bordered cards, and the offers were the third of them.
 * A host who never scrolled past the base price never learned that this is where a
 * promotion is created — the screen said so only in a heading below the fold. Two tabs
 * put both halves at the top of the pane, and the count rides on the promotions tab so
 * the answer to "do I have any offers running" is readable without pressing anything.
 *
 * It is the same segmented control the photos workspace and the editor's own halves
 * toggle use, drawn from the `ag-segment` tokens in globals.css, so this is the third
 * appearance of one shape rather than a third shape.
 *
 * Both panels stay mounted and the inactive one is `hidden`. That is the point rather
 * than an optimisation: each panel owns an unsaved draft and its own review dialog, and
 * unmounting one would silently discard a base price the host had typed but not yet
 * confirmed. `hidden` keeps the draft, the scroll position and the open review exactly
 * where they were left.
 */
export function PricingTabs({
  groupLabel,
  priceLabel,
  promotionsLabel,
  /** Active plus upcoming offers. Omitted from the label when there are none. */
  promotionCount,
  price,
  promotions,
}: {
  groupLabel: string;
  priceLabel: string;
  promotionsLabel: string;
  promotionCount: number;
  price: React.ReactNode;
  promotions: React.ReactNode;
}) {
  const [tab, setTab] = useState<"price" | "promotions">("price");
  const base = useId();
  const priceTab = useRef<HTMLButtonElement>(null);
  const promotionsTab = useRef<HTMLButtonElement>(null);

  const tabId = (name: string) => `${base}-tab-${name}`;
  const panelId = (name: string) => `${base}-panel-${name}`;

  /**
   * Left and right move between the two, as a tablist is expected to, and the focus
   * follows the selection — only the selected tab is in the tab order, so leaving focus
   * on the old one would strand it on an element the next Tab press cannot return to.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? "promotions"
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? "price"
          : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    (next === "price" ? priceTab : promotionsTab).current?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={groupLabel}
        onKeyDown={onKeyDown}
        className="ag-segment inline-flex"
      >
        <Tab
          ref={priceTab}
          id={tabId("price")}
          controls={panelId("price")}
          selected={tab === "price"}
          onSelect={() => setTab("price")}
          label={priceLabel}
        />
        <Tab
          ref={promotionsTab}
          id={tabId("promotions")}
          controls={panelId("promotions")}
          selected={tab === "promotions"}
          onSelect={() => setTab("promotions")}
          label={promotionsLabel}
          count={promotionCount > 0 ? promotionCount : undefined}
        />
      </div>

      <div
        role="tabpanel"
        id={panelId("price")}
        aria-labelledby={tabId("price")}
        hidden={tab !== "price"}
        className="pt-5"
      >
        {price}
      </div>
      <div
        role="tabpanel"
        id={panelId("promotions")}
        aria-labelledby={tabId("promotions")}
        hidden={tab !== "promotions"}
        className="pt-5"
      >
        {promotions}
      </div>
    </>
  );
}

/**
 * One tab.
 *
 * The count is a plain span rather than a coloured badge: it is a fact about the
 * listing, not an alert, and a pill here would compete with the white selected pill the
 * control already draws. It carries no `aria-label` of its own — a screen reader reads
 * "Promotions 2" from the tab's own text, which is the sentence a sighted host reads
 * too.
 */
function Tab({
  ref,
  id,
  controls,
  selected,
  onSelect,
  label,
  count,
}: {
  ref: React.Ref<HTMLButtonElement>;
  id: string;
  controls: string;
  selected: boolean;
  onSelect: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      ref={ref}
      type="button"
      id={id}
      role="tab"
      aria-selected={selected}
      aria-controls={controls}
      // Only the selected tab is in the tab order; the arrow keys move between them.
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className="ag-segment-option focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ag-hof)]"
    >
      {label}
      {count !== undefined ? (
        <span className="ms-1.5 tabular-nums text-[var(--ag-foggy)]">{count}</span>
      ) : null}
    </button>
  );
}
