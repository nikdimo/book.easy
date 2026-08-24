import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/(host-v2)/host/panel/route";
import { HOST_PANEL_COOKIE } from "@/lib/host/host-panel-preference";

describe("legacy host panel entry route", () => {
  it("uses a relative redirect so an internal localhost origin never reaches the browser", () => {
    const request = new NextRequest("http://localhost:3001/host/panel", {
      headers: {
        host: "lingerhomes.com",
        "x-forwarded-host": "lingerhomes.com",
        "x-forwarded-proto": "https",
      },
    });

    const response = GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/host");
    expect(response.headers.get("location")).not.toContain("localhost");
    expect(response.cookies.get(HOST_PANEL_COOKIE)?.value).toBe("");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
});
