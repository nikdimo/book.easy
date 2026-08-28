/**
 * "Edit" on the Review screen, and what it does to the step it lands on.
 *
 * Review links back to each step so a host can correct one answer. Without a marker in
 * that link the step has no way to know it was reached from the end of the flow, so its
 * CTA carries on to the next screen and the host has to walk every remaining step again
 * to get back to the summary they were reading.
 *
 * The marker is a query parameter rather than provider state or a stored "came from"
 * flag, because the flow already carries its whole context in the URL: a step reached
 * from Review is a different address from the same step reached in sequence, which is
 * what makes Back, a reload and a shared link all behave the same way.
 *
 * A step that sees it changes three things and nothing else: the CTA returns to Review
 * instead of advancing, it says so, and Back returns there too. What the step saves is
 * untouched — Review is a summary of the draft, so the answer still has to be written
 * before the host is shown it again.
 */

/** The parameter's only accepted value. Present means "came from Review". */
export const FLOW_REVIEW_RETURN = "review";

/** The CTA labels the flow footer knows how to render. */
export type FlowNextLabel = "Continue" | "Next" | "Save and review";

/** Whether a step's `returnTo` search param sends it back to Review. */
export function returnsToReview(value: string | string[] | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) === FLOW_REVIEW_RETURN;
}

/** The Review screen, carrying the flow's own query. */
export function reviewHref(query: string): string {
  return `/host/start/review?${query}`;
}

/**
 * Adds the marker to a link that stays inside the flow — the one case a step reached
 * from Review still hands off to another step rather than returning (property type,
 * whose answer decides which space types are offered at all).
 */
export function withReviewReturn(query: string, active: boolean): string {
  return active ? `${query}&returnTo=${FLOW_REVIEW_RETURN}` : query;
}

/**
 * Where a step's CTA goes and what it says.
 *
 * `query` is the flow's own query without the marker: the Review screen is where the
 * return trip ends, so linking to it with `returnTo` still set would leave the marker
 * on every edit link it then renders.
 */
export function stepNextTarget(
  active: boolean,
  query: string,
  defaultHref: string,
  defaultLabel: FlowNextLabel = "Next",
): { href: string; label: FlowNextLabel } {
  return active
    ? { href: reviewHref(query), label: "Save and review" }
    : { href: defaultHref, label: defaultLabel };
}
