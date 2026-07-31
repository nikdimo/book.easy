"use client";

import { useEffect } from "react";

const INSTALLED_FLAG = "__translateDomGuardInstalled";

type GuardedWindow = Window & { [INSTALLED_FLAG]?: boolean };

/**
 * Google Translate rewrites the page's text nodes in place, wrapping them in its own
 * `<font>` elements. React still holds references to the original nodes, so the next
 * time it unmounts or reorders that subtree it calls `removeChild`/`insertBefore` with
 * a node the expected parent no longer owns, and the DOM throws NotFoundError. The
 * crash surfaces as a full error overlay even though nothing is actually broken.
 *
 * Individual components have been opted out with `notranslate` as this came up (see
 * listing-location-field and listing-visibility-toggle), but any component rendering
 * translatable text that changes can hit it, so guard the two mutations globally
 * instead. Both branches below are unreachable unless the tree was already mutated
 * behind React's back — normal reconciliation still goes through the native methods.
 */
function installTranslateDomGuard() {
  const guardedWindow = window as GuardedWindow;
  if (guardedWindow[INSTALLED_FLAG]) return;
  guardedWindow[INSTALLED_FLAG] = true;

  const nativeRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child.parentNode !== this) {
      // Translate reparented it. Detach it from wherever it actually lives so the
      // node still leaves the document, then let React believe the removal succeeded.
      child.parentNode?.removeChild(child);
      return child;
    }
    return nativeRemoveChild.call(this, child) as T;
  };

  const nativeInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference && reference.parentNode !== this) {
      // The sibling React wanted to insert before is gone. Appending keeps the node
      // in the tree; ordering is cosmetic here and Translate re-runs over it anyway.
      this.appendChild(node);
      return node;
    }
    return nativeInsertBefore.call(this, node, reference) as T;
  };
}

export function TranslateDomGuard() {
  // An effect is early enough: Google's script is loaded async by the language
  // widget, so nothing has mutated the DOM by the time the first commit finishes.
  useEffect(installTranslateDomGuard, []);
  return null;
}
