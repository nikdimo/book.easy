/**
 * The listing editor's column geometry, in one place because two different components
 * draw the same column.
 *
 * The editor has two halves and each renders its own left column — the section cards for
 * "Your space", the arrival cards for the other. On Airbnb those two are the *same*
 * column: same width, same divider, same card style, so switching halves changes what is
 * in the column and nothing about the column itself. Ours used to change shape entirely
 * (a 208px rail of links against a 38% list of cards), and the toggle made that jump
 * happen right under the host's cursor.
 *
 * A fixed width rather than a percentage, which is what stops it moving as the window
 * resizes as well. 360px is the compromise between the two things the column is squeezed
 * by: a card needs room for a title and a summary line on one line each, and the pane
 * beside it still has to hold a photo grid and a twelve-month calendar. Nudge this one
 * number and both halves follow.
 */
export const EDITOR_LEFT_COLUMN_WIDTH = 360;

/**
 * The column itself, as Tailwind classes.
 *
 * Below `lg` the column is the whole screen — the editor's shell is only a fixed-height
 * two-pane frame from `lg` up, and a 360px column beside content on a phone would be two
 * cramped columns instead of one usable one. Each half decides for itself what to do with
 * the small-screen case; this is only about the desktop column.
 */
export const EDITOR_LEFT_COLUMN_CLASS =
  "lg:w-[360px] lg:min-w-[360px] lg:max-w-[360px] lg:flex-none lg:border-r lg:border-[var(--ag-bebe)]";
