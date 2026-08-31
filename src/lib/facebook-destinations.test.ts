import { describe, expect, it } from "vitest";
import {
  isSafeFacebookGroupUrl,
  normalizeFacebookGroupUrl,
} from "@/lib/facebook-destinations";

const CANONICAL = "https://www.facebook.com/groups/skopjerentals";

describe("normalizeFacebookGroupUrl", () => {
  it("accepts the plain desktop group URL unchanged", () => {
    const result = normalizeFacebookGroupUrl(CANONICAL);
    expect(result).toEqual({
      ok: true,
      url: CANONICAL,
      groupId: "skopjerentals",
    });
  });

  it("collapses every host variant the same group is copied from", () => {
    for (const variant of [
      "https://facebook.com/groups/skopjerentals",
      "https://m.facebook.com/groups/skopjerentals",
      "https://mobile.facebook.com/groups/skopjerentals",
      "https://web.facebook.com/groups/skopjerentals",
      "http://www.facebook.com/groups/skopjerentals",
      "https://www.fb.com/groups/skopjerentals",
    ]) {
      const result = normalizeFacebookGroupUrl(variant);
      expect(result.ok && result.url, variant).toBe(CANONICAL);
    }
  });

  it("strips tracking parameters, fragments and trailing slashes", () => {
    const result = normalizeFacebookGroupUrl(
      "https://www.facebook.com/groups/skopjerentals/?ref=share&__cft__[0]=abc#recent",
    );
    expect(result.ok && result.url).toBe(CANONICAL);
  });

  it("treats a link to a post inside the group as the group itself", () => {
    const result = normalizeFacebookGroupUrl(
      "https://www.facebook.com/groups/skopjerentals/posts/1234567890/",
    );
    expect(result.ok && result.url).toBe(CANONICAL);
  });

  it("normalizes case so one group cannot be saved twice", () => {
    const result = normalizeFacebookGroupUrl(
      "https://www.facebook.com/groups/SkopjeRentals",
    );
    expect(result.ok && result.url).toBe(CANONICAL);
  });

  it("still understands the legacy group.php?gid= form", () => {
    const result = normalizeFacebookGroupUrl(
      "https://www.facebook.com/group.php?gid=482910&ref=ts",
    );
    expect(result.ok && result.url).toBe(
      "https://www.facebook.com/groups/482910",
    );
  });

  it("assumes https for a host who typed the address without one", () => {
    const result = normalizeFacebookGroupUrl("  facebook.com/groups/skopjerentals  ");
    expect(result.ok && result.url).toBe(CANONICAL);
  });

  it("rejects a Facebook page, profile or marketplace link", () => {
    for (const notAGroup of [
      "https://www.facebook.com/lingerhomes",
      "https://www.facebook.com/marketplace/item/123",
      "https://www.facebook.com/groups/",
      "https://www.facebook.com/",
    ]) {
      expect(normalizeFacebookGroupUrl(notAGroup), notAGroup).toEqual({
        ok: false,
        error: "NOT_A_GROUP",
      });
    }
  });

  it("rejects anything that is not Facebook, including look-alike hosts", () => {
    for (const foreign of [
      "https://facebook.com.evil.example/groups/skopjerentals",
      "https://notfacebook.com/groups/skopjerentals",
      "https://evil.example/groups/skopjerentals",
    ]) {
      expect(normalizeFacebookGroupUrl(foreign), foreign).toEqual({
        ok: false,
        error: "NOT_FACEBOOK",
      });
    }
  });

  it("refuses a scheme a new tab must never be pointed at", () => {
    // The scheme is present, so it is never assumed to be https — these have to reach
    // the host check and fail it rather than becoming `https://javascript:...`.
    expect(normalizeFacebookGroupUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeFacebookGroupUrl("data:text/html,<script>").ok).toBe(false);
  });

  it("reports an empty paste as empty rather than as a bad URL", () => {
    expect(normalizeFacebookGroupUrl("   ")).toEqual({ ok: false, error: "EMPTY" });
  });
});

describe("isSafeFacebookGroupUrl", () => {
  it("passes only the exact canonical form", () => {
    expect(isSafeFacebookGroupUrl(CANONICAL)).toBe(true);
    // A stored row that is a valid group but not canonical fails closed: the workspace
    // opens what it verified, not what it could have rewritten.
    expect(isSafeFacebookGroupUrl("https://m.facebook.com/groups/skopjerentals")).toBe(
      false,
    );
    expect(isSafeFacebookGroupUrl("https://evil.example")).toBe(false);
    expect(isSafeFacebookGroupUrl("")).toBe(false);
  });
});
