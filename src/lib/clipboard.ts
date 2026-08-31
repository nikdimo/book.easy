/**
 * Copying text at the exact moment a new tab is opening.
 *
 * The modern Clipboard API is asynchronous, and browsers revoke its permission the
 * instant the page loses user activation — which is precisely what happens when the
 * same click also opens Facebook in a new tab. The synchronous
 * `document.execCommand("copy")` over a hidden textarea still runs inside the click, so
 * it lands before activation is spent.
 *
 * Both are therefore attempted, in that order: the selection copy first because it must
 * happen synchronously, then the promise-based one, whose success supersedes it. The
 * caller learns whether anything worked, so it can say so plainly rather than leaving
 * the host to paste and find out.
 */

/** Deprecated in the spec, still the only synchronous copy any browser offers. */
function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined") return false;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

/**
 * Copies `text`, resolving to whether it reached the clipboard.
 *
 * Must be called synchronously from the event handler — awaiting anything first spends
 * the user activation both mechanisms depend on.
 */
export async function copyTextRobustly(text: string): Promise<boolean> {
  const selectionCopied = copyWithSelection(text);

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // The async path is the one that fails when a new tab took activation away.
      // Fall through to whatever the synchronous attempt above already achieved.
      return selectionCopied;
    }
  }

  return selectionCopied;
}
