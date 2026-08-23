"use client";

import { Tx } from "@/lib/i18n/client";
import { SHEET_PRIMARY_BUTTON, SheetPanel } from "@/components/host/v2/sheet-panel";

/**
 * A dismissible panel for the explanation a step needs to be able to give without
 * putting it on the screen.
 *
 * The chrome — the scrim, the focus trap, Escape, the scroll lock, returning focus —
 * lives in `SheetPanel`, which house rules also builds its per-row editors from. This is
 * that panel with the one thing an explanation needs and an editor does not: a single
 * "Got it" that only dismisses.
 */
export function InfoSheet({
  open,
  onClose,
  title,
  returnFocusTo,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The control that opened this, so focus can go back to it on dismissal. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  return (
    <SheetPanel
      open={open}
      onClose={onClose}
      title={title}
      returnFocusTo={returnFocusTo}
      footer={
        <button type="button" onClick={onClose} className={SHEET_PRIMARY_BUTTON}>
          <Tx k="host.v2.info_sheet.got_it" source="Got it" />
        </button>
      }
    >
      {children}
    </SheetPanel>
  );
}
