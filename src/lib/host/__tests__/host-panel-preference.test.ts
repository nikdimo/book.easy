import { describe, expect, it } from "vitest";
import {
  hostPanelDestination,
  parseHostPanelVersion,
} from "@/lib/host/host-panel-preference";

describe("host panel preference", () => {
  it("accepts only the two supported panel versions", () => {
    expect(parseHostPanelVersion("current")).toBe("current");
    expect(parseHostPanelVersion("v2")).toBe("v2");
    expect(parseHostPanelVersion("old")).toBeNull();
    expect(parseHostPanelVersion(undefined)).toBeNull();
  });

  it("keeps current and preview panels on isolated routes", () => {
    expect(hostPanelDestination("current")).toBe("/host");
    expect(hostPanelDestination("v2")).toBe("/host/v2");
  });
});
