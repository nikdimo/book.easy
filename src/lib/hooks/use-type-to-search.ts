"use client";

import { useEffect, type RefObject } from "react";

/**
 * Focus a search field as soon as someone starts typing, without them having to
 * click into it first. The keystroke itself is not swallowed: focusing during
 * `keydown` means the browser delivers the character to the newly focused input,
 * so the first letter is never lost.
 *
 * Deliberately inert whenever typing already means something else — a modifier
 * chord, another field, a contenteditable — or when the field is hidden behind a
 * dialog that opened on top of it.
 */
export function useTypeToSearch(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Printable characters only: `key` is a single grapheme for those and a
      // name ("Tab", "ArrowDown") for everything else.
      if (event.key.length !== 1 || event.key === " ") return;

      const input = ref.current;
      if (!input || input.disabled || input.readOnly) return;
      if (document.activeElement === input) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      // A dialog opened on top of this field owns the keystroke — the last one
      // in the DOM is the one the user is looking at.
      const dialogs = document.querySelectorAll("[role='dialog']");
      const topmost = dialogs[dialogs.length - 1];
      if (topmost && !topmost.contains(input)) return;

      input.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, ref]);
}
