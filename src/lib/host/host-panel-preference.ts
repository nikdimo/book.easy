/**
 * There is one host panel, and it is Host V2.
 *
 * This module used to hold a two-way switch: a cookie remembering whether a host had
 * chosen the classic panel or the preview, and a destination for each. With the classic
 * panel retired there is nothing left to choose between, so `hostPanelDestination()`
 * takes no argument and there is no "current" branch that could send a host back into
 * a panel that no longer receives work.
 *
 * The cookie name outlives the switch on purpose: hosts who used the old toggle still
 * carry `bookeasy_host_panel=current` in their browser, and `/host/panel` clears it so
 * the stale value cannot be read by anything later.
 */

export const HOST_PANEL_COOKIE = "bookeasy_host_panel";

/** The host panel's entry point. */
export const HOST_PANEL_PATH = "/host";

export function hostPanelDestination(): string {
  return HOST_PANEL_PATH;
}
