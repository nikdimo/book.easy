import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
  listingBasicsComplete,
  listingBasicsIssues,
  normalizeListingBasics,
} from "@/lib/host/v2/listing-basics";
import {
  planBasicsAutosave,
  readBasicsSaveResult,
} from "@/lib/host/v2/listing-basics-autosave";

const validTitle = "Seaside apartment";
const validDescription =
  "A bright apartment two streets from the water, with a balcony over the square.";

describe("listingBasicsIssues", () => {
  it("accepts text inside the limits the classic form has always enforced", () => {
    expect(
      listingBasicsIssues({ title: validTitle, description: validDescription }),
    ).toEqual({});
  });

  it("reports both fields at once so the host fixes them in one pass", () => {
    expect(listingBasicsIssues({ title: "", description: "" })).toEqual({
      title: "EMPTY",
      description: "EMPTY",
    });
  });

  it("names a short field short rather than empty", () => {
    expect(
      listingBasicsIssues({
        title: "a".repeat(TITLE_MIN - 1),
        description: "b".repeat(DESCRIPTION_MIN - 1),
      }),
    ).toEqual({ title: "TOO_SHORT", description: "TOO_SHORT" });
  });

  it("accepts text exactly at the minimum and the maximum", () => {
    expect(
      listingBasicsIssues({
        title: "a".repeat(TITLE_MIN),
        description: "b".repeat(DESCRIPTION_MIN),
      }),
    ).toEqual({});
    expect(
      listingBasicsIssues({
        title: "a".repeat(TITLE_MAX),
        description: "b".repeat(DESCRIPTION_MAX),
      }),
    ).toEqual({});
  });

  it("rejects one character past either ceiling", () => {
    expect(
      listingBasicsIssues({
        title: "a".repeat(TITLE_MAX + 1),
        description: validDescription,
      }).title,
    ).toBe("TOO_LONG");
    expect(
      listingBasicsIssues({
        title: validTitle,
        description: "b".repeat(DESCRIPTION_MAX + 1),
      }).description,
    ).toBe("TOO_LONG");
  });

  it("does not let padding pass the minimum", () => {
    expect(
      listingBasicsIssues({
        title: `  ${"a".repeat(TITLE_MIN - 1)}  `,
        description: " ".repeat(DESCRIPTION_MIN + 10),
      }),
    ).toEqual({ title: "TOO_SHORT", description: "EMPTY" });
  });
});

describe("normalizeListingBasics", () => {
  it("trims the edges and keeps the paragraphs", () => {
    expect(
      normalizeListingBasics({
        title: "  Seaside apartment\n",
        description: "\n\nFirst floor.\n\nSecond floor.  ",
      }),
    ).toEqual({
      title: "Seaside apartment",
      description: "First floor.\n\nSecond floor.",
    });
  });
});

describe("listingBasicsComplete", () => {
  it("is true only when both fields satisfy their limits", () => {
    expect(
      listingBasicsComplete({ title: validTitle, description: validDescription }),
    ).toBe(true);
    expect(listingBasicsComplete({ title: validTitle, description: "Too short." })).toBe(
      false,
    );
    expect(listingBasicsComplete({ title: "Home", description: validDescription })).toBe(
      false,
    );
    expect(listingBasicsComplete({ title: "", description: "" })).toBe(false);
  });
});

describe("planBasicsAutosave", () => {
  const saved = { title: validTitle, description: validDescription };

  it("skips a tick that would send what the server already holds", () => {
    expect(planBasicsAutosave({ ...saved }, saved)).toEqual({
      action: "skip",
      reason: "unchanged",
    });
  });

  it("treats a whitespace-only edit as unchanged", () => {
    expect(
      planBasicsAutosave(
        { title: `  ${validTitle} `, description: `${validDescription}\n` },
        saved,
      ),
    ).toEqual({ action: "skip", reason: "unchanged" });
  });

  it("holds a half-typed draft back instead of collecting a refusal", () => {
    expect(
      planBasicsAutosave({ title: "Sea", description: validDescription }, saved),
    ).toEqual({ action: "skip", reason: "incomplete" });
  });

  it("sends the normalized text once the section is valid and changed", () => {
    expect(
      planBasicsAutosave(
        { title: "  Harbor loft  ", description: `  ${validDescription}  ` },
        saved,
      ),
    ).toEqual({
      action: "save",
      value: { title: "Harbor loft", description: validDescription },
    });
  });
});

describe("readBasicsSaveResult", () => {
  const sent = { title: validTitle, description: validDescription };

  it("settles on the values the server reports it stored", () => {
    expect(
      readBasicsSaveResult(sent, {
        title: "Seaside apartment",
        description: validDescription,
        complete: true,
      }),
    ).toEqual({ status: "saved", saved: sent });
  });

  it("reports a refused write as failed, not saved", () => {
    expect(
      readBasicsSaveResult(sent, { issues: { description: "TOO_SHORT" } }),
    ).toEqual({ status: "failed", issues: { description: "TOO_SHORT" } });
  });

  it("carries an ownership failure through as a message", () => {
    expect(readBasicsSaveResult(sent, { error: "Listing not found." })).toEqual({
      status: "failed",
      message: "Listing not found.",
    });
  });

  it("does not treat an empty issues bag as a failure", () => {
    expect(readBasicsSaveResult(sent, { issues: {} }).status).toBe("saved");
  });
});
