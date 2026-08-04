import { describe, expect, it } from "vitest";
import {
  availabilityBlocksPublish,
  availabilityStartBlock,
  blockedNightsCount,
  parseAvailabilityStart,
  validateAvailabilityStartForPublish,
} from "@/lib/types/listing-availability-start";
import {
  DEFAULT_BLOCK_REASON,
  EMPTY_PRE_PUBLISH_PLAN,
  mergeInclusiveBlockRanges,
  parsePrePublishPlan,
  planRangeToAvailabilityBlock,
  planRangeToDbRange,
  type InclusiveBlockRange,
  type PrePublishPlan,
} from "@/lib/types/listing-prepublish-plan";
import { prePublishBackTarget } from "@/lib/types/listing-prepublish-navigation";
import { dbDateToYmd, eachYmdExclusive } from "@/lib/utils/date-only";

/** Fixed "today" throughout: these rules are about the relationship between the host's
 *  chosen date and the current one, and a real clock would make them expire. */
const TODAY = "2026-08-04";

/** The nights a plan range actually takes off the calendar once it has been through the
 *  inclusive-to-exclusive conversion the database expects. */
function blockedNights(range: { startDate: string; endDate: string }) {
  const converted = planRangeToDbRange(range);
  expect(converted).not.toBeNull();
  return eachYmdExclusive(
    dbDateToYmd(converted!.startDate),
    dbDateToYmd(converted!.endDate),
  );
}

describe("publishing is refused until the host has answered", () => {
  it("rejects a plan with no availability choice", () => {
    const result = validateAvailabilityStartForPublish(null, TODAY);

    expect(result).toEqual({ ok: false, reason: "unconfirmed" });
  });

  it("holds Publish in the wizard while the answer is missing", () => {
    expect(
      availabilityBlocksPublish({
        isEditing: false,
        availabilityStart: null,
        today: TODAY,
      }),
    ).toBe(true);
  });

  it("never downgrades an unusable answer to available now", () => {
    // The failure this screen exists to prevent: a listing going live bookable from
    // today because its stored answer could not be read.
    for (const raw of [
      undefined,
      null,
      {},
      { mode: "whenever" },
      { mode: "from" },
      { mode: "from", startDate: "" },
      { mode: "from", startDate: "next tuesday" },
      { mode: "from", startDate: "2026-02-30" },
      { mode: "from", startDate: 20260901 },
    ]) {
      const choice = parseAvailabilityStart(raw);

      expect(choice).toBeNull();
      expect(validateAvailabilityStartForPublish(choice, TODAY).ok).toBe(false);
    }
  });

  it("rejects a start date that has already passed", () => {
    const result = validateAvailabilityStartForPublish(
      { mode: "from", startDate: "2026-07-01" },
      TODAY,
    );

    expect(result).toEqual({ ok: false, reason: "past-date" });
  });

  it("accepts today itself as a start date", () => {
    // The boundary is "not in the past", not "strictly future" — a host answering the
    // question on the day they open should not be told their answer is stale.
    expect(
      validateAvailabilityStartForPublish(
        { mode: "from", startDate: TODAY },
        TODAY,
      ),
    ).toEqual({ ok: true, value: { mode: "from", startDate: TODAY } });
  });
});

describe("available now", () => {
  it("publishes without creating any initial block", () => {
    const result = validateAvailabilityStartForPublish({ mode: "now" }, TODAY);
    expect(result.ok).toBe(true);

    expect(availabilityStartBlock({ mode: "now" }, TODAY)).toBeNull();
  });

  it("clears the wizard's publish gate", () => {
    expect(
      availabilityBlocksPublish({
        isEditing: false,
        availabilityStart: { mode: "now" },
        today: TODAY,
      }),
    ).toBe(false);
  });
});

describe("available from a specific date", () => {
  const SEPT_1 = "2026-09-01";

  it("blocks every night before the start date and leaves it bookable", () => {
    const block = availabilityStartBlock({ mode: "from", startDate: SEPT_1 }, TODAY);

    // Inclusive plan range: today through the night before the start date.
    expect(block).toEqual({ startDate: TODAY, endDate: "2026-08-31" });

    const nights = blockedNights(block!);
    expect(nights).toContain(TODAY);
    expect(nights).toContain("2026-08-31");
    // The whole point: 1 September is the first night a guest can check in.
    expect(nights).not.toContain(SEPT_1);
  });

  it("stores the block with the database's exclusive end date", () => {
    const block = availabilityStartBlock({ mode: "from", startDate: SEPT_1 }, TODAY);
    const converted = planRangeToDbRange(block!);

    // Exclusive end === the start date itself, which is what keeps it open.
    expect(dbDateToYmd(converted!.endDate)).toBe(SEPT_1);
  });

  it("creates nothing when the start date is today", () => {
    expect(
      availabilityStartBlock({ mode: "from", startDate: TODAY }, TODAY),
    ).toBeNull();
  });

  it("blocks exactly one night when the start date is tomorrow", () => {
    const block = availabilityStartBlock(
      { mode: "from", startDate: "2026-08-05" },
      TODAY,
    );

    expect(blockedNights(block!)).toEqual([TODAY]);
  });

  it("crosses a year boundary without losing the first bookable night", () => {
    const block = availabilityStartBlock(
      { mode: "from", startDate: "2027-01-01" },
      "2026-12-30",
    );

    expect(block).toEqual({ startDate: "2026-12-30", endDate: "2026-12-31" });
    expect(blockedNights(block!)).toEqual(["2026-12-30", "2026-12-31"]);
  });
});

describe("a start date and manual blocks compose", () => {
  const plan: PrePublishPlan = {
    ...EMPTY_PRE_PUBLISH_PLAN,
    availabilityStart: { mode: "from", startDate: "2026-09-01" },
    // A week the host is using the property themselves, well after they open.
    blocks: [{ startDate: "2026-09-14", endDate: "2026-09-20" }],
  };

  it("keeps both, and leaves the nights between them bookable", () => {
    const startBlock = availabilityStartBlock(plan.availabilityStart!, TODAY);
    const startNights = blockedNights(startBlock!);
    const manualNights = blockedNights(plan.blocks[0]);

    expect(startNights).not.toContain("2026-09-01");
    expect(manualNights).toHaveLength(7);
    expect(manualNights).toContain("2026-09-20");
    // The night after the manual block is open again — the two are independent.
    expect(manualNights).not.toContain("2026-09-21");
    // Nothing between opening and the holiday is blocked by either.
    for (const night of ["2026-09-01", "2026-09-13", "2026-09-21"]) {
      expect(startNights).not.toContain(night);
      expect(manualNights).not.toContain(night);
    }
  });

  it("keeps manual blocks on the corrected inclusive-to-exclusive conversion", () => {
    // Phase 1's fix, re-asserted here because this feature adds a second writer of
    // AvailabilityBlock rows and must not have moved the boundary for the first.
    const block = planRangeToAvailabilityBlock({
      startDate: "2026-09-14",
      endDate: "2026-09-20",
    });

    expect(dbDateToYmd(block!.startDate)).toBe("2026-09-14");
    expect(dbDateToYmd(block!.endDate)).toBe("2026-09-21");
    expect(block!.blockType).toBe("MANUAL_BLOCK");
  });

  it("still blocks exactly one night for a single-day manual selection", () => {
    expect(
      blockedNights({ startDate: "2026-09-14", endDate: "2026-09-14" }),
    ).toEqual(["2026-09-14"]);
  });
});

describe("merging blocks before they reach the database", () => {
  const START_REASON = "Before the listing's availability start date";

  /**
   * What the publish action builds: the availability-start block first (so the reason
   * rule — earliest start wins — keeps its wording), then the host's own ranges.
   */
  function publishBlocks(
    availabilityStart: Parameters<typeof availabilityStartBlock>[0],
    manual: { startDate: string; endDate: string }[],
    today = TODAY,
  ) {
    const startBlock = availabilityStartBlock(availabilityStart, today);
    const ranges: InclusiveBlockRange[] = [
      ...(startBlock ? [{ ...startBlock, reason: START_REASON }] : []),
      ...manual.map((block) => ({ ...block, reason: DEFAULT_BLOCK_REASON })),
    ];
    return mergeInclusiveBlockRanges(ranges).map((range) => {
      const block = planRangeToAvailabilityBlock(range, range.reason);
      expect(block).not.toBeNull();
      return {
        startDate: dbDateToYmd(block!.startDate),
        endDate: dbDateToYmd(block!.endDate),
        reason: block!.reason,
      };
    });
  }

  /** The exclusion constraint is `daterange(startDate, endDate, '[)') WITH &&`, so this
   *  is the exact condition that would abort the publish. */
  function hasOverlap(rows: { startDate: string; endDate: string }[]) {
    return rows.some((left, i) =>
      rows.some(
        (right, j) =>
          i !== j && left.startDate < right.endDate && left.endDate > right.startDate,
      ),
    );
  }

  it("absorbs a manual range that sits entirely inside the pre-start block", () => {
    // Blocking a week in August while opening on 1 September: the week is already
    // covered, and two rows for it would collide.
    const rows = publishBlocks({ mode: "from", startDate: "2026-09-01" }, [
      { startDate: "2026-08-10", endDate: "2026-08-16" },
    ]);

    expect(rows).toEqual([
      { startDate: TODAY, endDate: "2026-09-01", reason: START_REASON },
    ]);
    expect(hasOverlap(rows)).toBe(false);
  });

  it("extends the pre-start block when a manual range crosses its boundary", () => {
    // Aug 25 – Sep 5 straddles the 1 September opening, so the merged block has to run
    // past it — and 6 September becomes the first bookable night.
    const rows = publishBlocks({ mode: "from", startDate: "2026-09-01" }, [
      { startDate: "2026-08-25", endDate: "2026-09-05" },
    ]);

    expect(rows).toEqual([
      { startDate: TODAY, endDate: "2026-09-06", reason: START_REASON },
    ]);
    expect(hasOverlap(rows)).toBe(false);
  });

  it("merges a manual range that starts the day the pre-start block ends", () => {
    // Adjacent, not overlapping: 1–7 September begins exactly where "before 1
    // September" stops. One row for one continuous closure.
    const rows = publishBlocks({ mode: "from", startDate: "2026-09-01" }, [
      { startDate: "2026-09-01", endDate: "2026-09-07" },
    ]);

    expect(rows).toEqual([
      { startDate: TODAY, endDate: "2026-09-08", reason: START_REASON },
    ]);
  });

  it("merges two overlapping manual ranges", () => {
    const rows = publishBlocks({ mode: "now" }, [
      { startDate: "2026-09-14", endDate: "2026-09-20" },
      { startDate: "2026-09-18", endDate: "2026-09-25" },
    ]);

    expect(rows).toEqual([
      {
        startDate: "2026-09-14",
        endDate: "2026-09-26",
        reason: DEFAULT_BLOCK_REASON,
      },
    ]);
    expect(hasOverlap(rows)).toBe(false);
  });

  it("leaves genuinely separate ranges as separate rows", () => {
    const rows = publishBlocks({ mode: "now" }, [
      { startDate: "2026-09-14", endDate: "2026-09-20" },
      { startDate: "2026-10-05", endDate: "2026-10-05" },
    ]);

    expect(rows).toEqual([
      {
        startDate: "2026-09-14",
        endDate: "2026-09-21",
        reason: DEFAULT_BLOCK_REASON,
      },
      {
        startDate: "2026-10-05",
        endDate: "2026-10-06",
        reason: DEFAULT_BLOCK_REASON,
      },
    ]);
    expect(hasOverlap(rows)).toBe(false);
  });

  it("available now writes only the host's own blocks", () => {
    const rows = publishBlocks({ mode: "now" }, [
      { startDate: "2026-09-14", endDate: "2026-09-20" },
    ]);

    expect(rows).toEqual([
      {
        startDate: "2026-09-14",
        endDate: "2026-09-21",
        reason: DEFAULT_BLOCK_REASON,
      },
    ]);
  });

  it("available from writes only the pre-start block when nothing is blocked", () => {
    const rows = publishBlocks({ mode: "from", startDate: "2026-09-01" }, []);

    expect(rows).toEqual([
      { startDate: TODAY, endDate: "2026-09-01", reason: START_REASON },
    ]);
  });

  it("available now with no blocks writes nothing at all", () => {
    expect(publishBlocks({ mode: "now" }, [])).toEqual([]);
  });

  it("keeps the start date bookable through every merge", () => {
    // The property that must survive all of the above: nothing blocks 1 September
    // unless the host explicitly blocked it themselves.
    const rows = publishBlocks({ mode: "from", startDate: "2026-09-01" }, [
      { startDate: "2026-08-10", endDate: "2026-08-16" },
      { startDate: "2026-09-20", endDate: "2026-09-22" },
    ]);

    const blockedNights = rows.flatMap((row) =>
      eachYmdExclusive(row.startDate, row.endDate),
    );
    expect(blockedNights).not.toContain("2026-09-01");
    expect(hasOverlap(rows)).toBe(false);
  });

  it("drops malformed ranges instead of emitting a broken row", () => {
    expect(
      mergeInclusiveBlockRanges([
        { startDate: "2026-02-30", endDate: "2026-03-02", reason: "x" },
        { startDate: "2026-03-05", endDate: "2026-03-01", reason: "x" },
        { startDate: "nonsense", endDate: "2026-03-02", reason: "x" },
      ]),
    ).toEqual([]);
  });

  it("gives a merged span the earliest-starting range's reason", () => {
    // Deterministic and order-independent: sorting by start date decides, not the
    // order the caller happened to build the list in.
    expect(
      mergeInclusiveBlockRanges([
        { startDate: "2026-09-10", endDate: "2026-09-14", reason: "later" },
        { startDate: "2026-09-01", endDate: "2026-09-12", reason: "earlier" },
      ]),
    ).toEqual([
      { startDate: "2026-09-01", endDate: "2026-09-14", reason: "earlier" },
    ]);
  });
});

describe("the checklist reports blocked nights, not ranges", () => {
  it("counts nights across every range", () => {
    // Two ranges, eight nights — the number a host recognises as what they blocked.
    expect(
      blockedNightsCount([
        { startDate: "2026-09-14", endDate: "2026-09-20" },
        { startDate: "2026-10-05", endDate: "2026-10-05" },
      ]),
    ).toBe(8);
  });

  it("does not double-count overlapping ranges", () => {
    expect(
      blockedNightsCount([
        { startDate: "2026-09-14", endDate: "2026-09-16" },
        { startDate: "2026-09-15", endDate: "2026-09-17" },
      ]),
    ).toBe(4);
  });

  it("ignores malformed ranges rather than throwing", () => {
    expect(
      blockedNightsCount([
        { startDate: "2026-02-30", endDate: "2026-03-02" },
        { startDate: "2026-03-05", endDate: "2026-03-01" },
        { startDate: "nonsense", endDate: "2026-03-02" },
      ]),
    ).toBe(0);
  });

  it("reports nothing blocked for a fresh plan", () => {
    expect(blockedNightsCount(EMPTY_PRE_PUBLISH_PLAN.blocks)).toBe(0);
  });
});

describe("draft save and resume", () => {
  it("preserves available now", () => {
    const plan: PrePublishPlan = {
      ...EMPTY_PRE_PUBLISH_PLAN,
      availabilityStart: { mode: "now" },
    };

    expect(parsePrePublishPlan(JSON.stringify(plan)).availabilityStart).toEqual({
      mode: "now",
    });
  });

  it("preserves a start date alongside the host's blocks", () => {
    const plan: PrePublishPlan = {
      ...EMPTY_PRE_PUBLISH_PLAN,
      availabilityStart: { mode: "from", startDate: "2026-09-01" },
      blocks: [{ startDate: "2026-09-14", endDate: "2026-09-20" }],
    };

    const resumed = parsePrePublishPlan(JSON.stringify(plan));

    expect(resumed.availabilityStart).toEqual({
      mode: "from",
      startDate: "2026-09-01",
    });
    expect(resumed.blocks).toEqual(plan.blocks);
  });

  it("keeps a start date that has since passed so the host can correct it", () => {
    // Dropping it would show an empty screen and look like the draft lost the answer.
    // It survives the round trip, and publishing is where it is refused.
    const resumed = parsePrePublishPlan(
      JSON.stringify({
        ...EMPTY_PRE_PUBLISH_PLAN,
        availabilityStart: { mode: "from", startDate: "2020-01-01" },
      }),
    );

    expect(resumed.availabilityStart).toEqual({
      mode: "from",
      startDate: "2020-01-01",
    });
    expect(
      validateAvailabilityStartForPublish(resumed.availabilityStart, TODAY),
    ).toEqual({ ok: false, reason: "past-date" });
  });
});

describe("drafts saved before this screen existed", () => {
  /** Exactly what a pre-feature draft's prePublishPlan looks like: the three optional
   *  lists, and no availability field at all. */
  const legacyDraft = {
    blocks: [{ startDate: "2026-09-14", endDate: "2026-09-20" }],
    datePrices: [
      { startDate: "2026-12-24", endDate: "2026-12-31", nightlyRate: 200 },
    ],
    offers: [],
  };

  it("still loads, keeping the work the host already did", () => {
    const resumed = parsePrePublishPlan(JSON.stringify(legacyDraft));

    expect(resumed.blocks).toEqual(legacyDraft.blocks);
    expect(resumed.datePrices).toEqual(legacyDraft.datePrices);
  });

  it("is sent back to confirm availability rather than published as-is", () => {
    const resumed = parsePrePublishPlan(JSON.stringify(legacyDraft));

    expect(resumed.availabilityStart).toBeNull();
    expect(
      availabilityBlocksPublish({
        isEditing: false,
        availabilityStart: resumed.availabilityStart,
        today: TODAY,
      }),
    ).toBe(true);
  });
});

describe("editing an existing listing is unaffected", () => {
  it("never gates Publish changes on the wizard's availability question", () => {
    // An existing listing's availability lives on its own calendar. The edit form has
    // no pre-publish plan and must not inherit a gate it has no screen to satisfy.
    for (const availabilityStart of [
      null,
      { mode: "now" } as const,
      { mode: "from", startDate: "2020-01-01" } as const,
    ]) {
      expect(
        availabilityBlocksPublish({
          isEditing: true,
          availabilityStart,
          today: TODAY,
        }),
      ).toBe(false);
    }
  });
});

describe("closing the blocking calendar", () => {
  it("returns to the availability question it was opened from", () => {
    expect(prePublishBackTarget("availability", "availability-start")).toBe(
      "availability-start",
    );
  });

  it("still returns to the checklist when opened from there", () => {
    expect(prePublishBackTarget("availability", "menu")).toBe("menu");
  });

  it("leaves the pre-publish flow when backing out of the question itself", () => {
    // Back from the question goes to the wizard's last numbered step; the checklist is
    // forwards from here, not backwards.
    expect(prePublishBackTarget("availability-start", "menu")).toBeNull();
  });
});
