import { describe, expect, it } from "vitest";
import {
  HOST_PANEL_PATH,
  hostPanelDestination,
} from "@/lib/host/host-panel-preference";

describe("host panel preference", () => {
  it("has one destination, which is Host V2", () => {
    expect(hostPanelDestination()).toBe("/host");
    expect(HOST_PANEL_PATH).toBe("/host");
  });

  it("does not expose the implementation-version URL", () => {
    expect(hostPanelDestination()).not.toBe("/host/v2");
  });
});
