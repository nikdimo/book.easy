import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@/lib/rate-limit";

describe("clientIpFromHeaders", () => {
  it("prefers Cloudflare's validated client address", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-real-ip": "198.51.100.20",
      "x-forwarded-for": "192.0.2.30, 198.51.100.20",
    });

    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");
  });

  it("accepts a valid forwarded address when canonical headers are absent", () => {
    const headers = new Headers({
      "x-forwarded-for": "2001:db8::1, 198.51.100.20",
    });

    expect(clientIpFromHeaders(headers)).toBe("2001:db8::1");
  });

  it("uses one shared bucket for spoofed non-IP values", () => {
    const headers = new Headers({ "x-forwarded-for": "attacker-controlled" });

    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });
});
