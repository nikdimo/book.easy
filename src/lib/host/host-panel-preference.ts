export const HOST_PANEL_COOKIE = "bookeasy_host_panel";

export type HostPanelVersion = "current" | "v2";

export function parseHostPanelVersion(value: unknown): HostPanelVersion | null {
  return value === "current" || value === "v2" ? value : null;
}

export function hostPanelDestination(version: HostPanelVersion) {
  return version === "v2" ? "/host/v2" : "/host";
}
