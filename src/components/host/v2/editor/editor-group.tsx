/**
 * One rank for every group heading in the editor.
 *
 * The sections drifted into three different treatments — `text-sm font-medium` in
 * Property details and Title & description, a `text-sm uppercase` eyebrow in House
 * rules — and none of them outranked the rows underneath. "Rooms and beds" was set in
 * exactly the weight of "Bedrooms" and "Beds" beneath it, so a heading read as one more
 * row rather than as the thing the rows belong to.
 *
 * The section title above these used to carry the hierarchy on its own, but it was
 * saying what the rail, the header and the browser tab already said. With it gone the
 * group heading is the largest thing on the page, which is what it was always for.
 */
export const EDITOR_GROUP_HEADING = "text-base font-semibold text-slate-900";

/**
 * The rule between two groups.
 *
 * Space alone stopped being enough once the groups grew controls of their own: a gap
 * reads as a gap whatever is on either side of it, while a line says the thing above
 * has ended. Applied from the second group down — a rule above the first would be
 * fencing off the top of the page.
 */
export const EDITOR_GROUP_DIVIDER = "mt-10 border-t border-slate-100 pt-8";
