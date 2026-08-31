"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The panel every host-panel sheet is made of.
 *
 * Lifted out of `InfoSheet`, which was the only thing in the flow that had solved this
 * and therefore the only place a second sheet could copy it from. House rules edits each
 * row in a sheet of its own, and a focus trap re-implemented per row is a focus trap that
 * is wrong in at least one of them.
 *
 * A sheet rather than an inline accordion, deliberately: several steps of this flow are
 * `md:h-dvh md:overflow-hidden`, so an expanding block would push the footer's Next off a
 * short viewport — and on a phone a bottom sheet is the shape this content already wants.
 * It rises from the bottom edge on small screens and, from `sm` up, either centres
 * (`variant="center"`, the default and what every earlier caller gets) or pins to the
 * right edge (`variant="side"`, for editing something the host is still reading).
 *
 * Behaviour that `role="dialog" aria-modal="true"` promises and markup alone does not:
 * Escape closes, Tab stays inside, the page behind stops scrolling, and focus returns to
 * whatever opened it.
 */
export function SheetPanel({
  open,
  onClose,
  title,
  returnFocusTo,
  variant = "center",
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The control that opened this, so focus can go back to it on dismissal. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /**
   * Where the panel sits once there is room for a choice.
   *
   * `center` is the original and stays the default, so every sheet that existed before
   * this prop is untouched. `side` pins it to the right edge at full height from `md`
   * up, for a panel that edits something the host is still looking at — the payment
   * method rows must not move while their details are open.
   *
   * Below `md` the two are the same bottom sheet. `md` rather than `sm` because the
   * drawer is 448px wide: at 640px that leaves a 190px sliver of the thing the drawer
   * exists to keep visible, which is worse than the bottom sheet a phone in landscape
   * already expects.
   */
  variant?: "center" | "side";
  /** An optional line under the title, wired to `aria-describedby`. */
  description?: React.ReactNode;
  children: React.ReactNode;
  /** The panel's own actions. A sheet with none is a sheet you read and dismiss. */
  footer?: React.ReactNode;
}) {
  const i18n = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  // Unique per instance: two sheets can be mounted at once (one closed), and a shared
  // id would point `aria-labelledby` at whichever heading rendered last.
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    // Captured at open time: reading the ref in the cleanup instead would be a
    // stale-node hazard.
    const trigger = returnFocusTo?.current ?? null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    // The panel itself takes focus, so a screen reader lands on the heading rather than
    // staying behind on the trigger.
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  // Only a press that starts and ends on the scrim itself — a drag out of the panel must
  // not be read as "dismiss".
  const onBackdropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/40",
        variant === "side"
          ? "md:items-stretch md:justify-end"
          : "sm:grid sm:place-items-center sm:p-4",
      )}
      onPointerDown={onBackdropPointerDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          // One scroll container, always: the panel itself. A drawer whose body scrolls
          // inside a fixed header and a fixed footer gives a short viewport two nested
          // scrollbars and a Done button parked over the last field.
          "relative max-h-[85dvh] w-full max-w-[34rem] overflow-y-auto rounded-t-[2rem] bg-white p-6 shadow-2xl outline-none",
          variant === "side"
            ? "md:h-dvh md:max-h-none md:w-[28rem] md:max-w-[min(100vw,30rem)] md:rounded-none md:rounded-l-[1.75rem] md:p-7"
            : "sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem] sm:p-8",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={i18n.resolve("host.v2.info_sheet.close", "Close").text}
          className="absolute right-5 top-5 grid size-11 place-items-center rounded-full transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 md:size-9"
        >
          <X className="size-5" aria-hidden />
        </button>
        <h2
          id={titleId}
          className="pr-12 font-heading text-xl font-semibold tracking-[-0.02em] text-slate-950"
        >
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-slate-500">
            {description}
          </p>
        ) : null}
        <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">{children}</div>
        {footer}
      </div>
    </div>
  );
}

/** The full-width dark button a sheet closes on. Its own export because both the info
 *  sheet and every house-rules editor end with one, and they must be the same button. */
export const SHEET_PRIMARY_BUTTON =
  "mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-slate-950 px-6 font-heading text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:bg-slate-300";
