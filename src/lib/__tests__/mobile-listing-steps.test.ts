import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LISTING_STEP, LISTING_STEPS } from "@/lib/constants/listing-steps";
import {
  mobileListingSteps,
  resolveMobileDraftStep,
} from "@/lib/mobile-listing-steps";

describe("mobileListingSteps", () => {
  // The mobile app builds its wizard from this payload and holds no list of its
  // own. If anyone replaces the derivation with a hand-written list, the two drift
  // the moment LISTING_STEPS is reordered — which is exactly what happened before.
  it("serves every wizard step, in the wizard's order", () => {
    expect(mobileListingSteps().map((step) => step.id)).toEqual(
      LISTING_STEPS.map((step) => step.id)
    );
  });

  it("gives every step the copy the client needs to render it", () => {
    for (const step of mobileListingSteps()) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveMobileDraftStep", () => {
  it("summarises a draft from its step id", () => {
    expect(resolveMobileDraftStep({ currentStepId: "amenities" })).toEqual({
      id: "amenities",
      title: LISTING_STEPS[LISTING_STEP.amenities].title,
      position: LISTING_STEP.amenities + 1,
      total: LISTING_STEPS.length,
    });
  });

  it("lets the id win over a stale numeric index", () => {
    // The pair a draft saved before the reorder looks like: the index said
    // "Location" under the old seven-step list, the id says what the host meant.
    expect(
      resolveMobileDraftStep({ currentStepId: "pricing", currentStep: 1 })
    ).toMatchObject({ id: "pricing", position: LISTING_STEP.pricing + 1 });
  });

  it("falls back to the legacy index for drafts saved before ids existed", () => {
    expect(resolveMobileDraftStep({ currentStep: 3 })).toMatchObject({
      id: LISTING_STEPS[3].id,
      position: 4,
    });
  });

  it("resolves an empty or malformed draft to the first step", () => {
    expect(resolveMobileDraftStep({})).toMatchObject({
      id: LISTING_STEPS[0].id,
      position: 1,
    });
    expect(
      resolveMobileDraftStep({ currentStepId: "a-step-we-removed" })
    ).toMatchObject({ id: LISTING_STEPS[0].id });
  });

  it("reports the summary against the current list, not a frozen count", () => {
    // Reordering LISTING_STEPS must move the wizard and this summary together —
    // neither the API nor the listings screen holds a count of its own.
    for (const step of LISTING_STEPS) {
      const summary = resolveMobileDraftStep({ currentStepId: step.id });
      expect(summary.total).toBe(LISTING_STEPS.length);
      expect(summary.title).toBe(step.title);
      expect(mobileListingSteps()[summary.position - 1].id).toBe(step.id);
    }
  });
});

/** The mobile app is a separate package with no test runner of its own, and the
 *  failure this guards against is textual: someone reintroducing a literal step
 *  list or step count in a screen. Reading the sources is the only way to catch it
 *  from here. */
describe("mobile screens keep no listing-step list of their own", () => {
  const mobileSrc = join(process.cwd(), "mobile", "src");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  const sources = sourceFiles(mobileSrc).map((path) => ({
    path,
    text: readFileSync(path, "utf8"),
  }));

  it("finds mobile sources to check", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  // Both forms the app actually used: a "Step 3 of 7" counter, where the literal
  // trails a translated "of" and so is not adjacent to it in the source, and a
  // progress bar dividing by the count. Verified against the real pre-fix lines —
  // a narrower pattern matched the progress bar and silently missed both counters.
  const HARDCODED_COUNT = /\bof\b["'`)}\s]*\d+|\/\s*\d+\s*\)\s*\*\s*100/;

  it("has no hardcoded step count", () => {
    for (const { path, text } of sources) {
      const offenders = text
        .split("\n")
        .filter((line) => HARDCODED_COUNT.test(line))
        .map((line) => line.trim());
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("has no literal list of step titles", () => {
    // Two or more canonical titles as adjacent string literals is a copied list.
    const titles = LISTING_STEPS.map((step) => step.title);
    for (const { path, text } of sources) {
      const quoted = titles.filter((title) => text.includes(`"${title}",`));
      expect({ path, quoted }).toEqual({ path, quoted: [] });
    }
  });
});
