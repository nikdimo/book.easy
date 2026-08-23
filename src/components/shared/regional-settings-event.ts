/**
 * The one channel for opening the shared regional-settings dialog from outside it.
 *
 * Its own module, with no imports, on purpose: the openers are small client controls in
 * headers and menus, and importing the constant from the dialog dragged the dialog's
 * whole dependency graph — server actions, `next-auth`, Prisma-backed language
 * services — into every one of them. A header should not have to load the auth stack
 * to know the name of an event.
 */
export const REGIONAL_SETTINGS_OPEN_EVENT = "regional-settings:open";

export interface RegionalSettingsOpenDetail {
  tab?: "language" | "currency";
}
