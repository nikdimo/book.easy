import { describe, it, expect } from "vitest";
import {
  computePopularityScore,
  decayFactor,
  ageInDays,
  BOOKING_WEIGHT,
  VIEW_WEIGHT,
  CANCELLED_BOOKING_WEIGHT,
  POPULARITY_HALF_LIFE_DAYS,
  POPULARITY_WINDOW_DAYS,
} from "@/lib/utils/popularity-score";

const NOW = new Date("2026-07-24T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("decayFactor", () => {
  it("is 1 for something that just happened", () => {
    expect(decayFactor(0)).toBe(1);
  });

  it("halves after one half-life", () => {
    expect(decayFactor(POPULARITY_HALF_LIFE_DAYS)).toBeCloseTo(0.5, 10);
    expect(decayFactor(POPULARITY_HALF_LIFE_DAYS * 2)).toBeCloseTo(0.25, 10);
  });

  it("drops to zero outside the scoring window", () => {
    expect(decayFactor(POPULARITY_WINDOW_DAYS)).toBe(0);
    expect(decayFactor(POPULARITY_WINDOW_DAYS + 30)).toBe(0);
  });
});

describe("ageInDays", () => {
  it("never goes negative for a future timestamp", () => {
    expect(ageInDays(new Date(NOW.getTime() + 60_000), NOW)).toBe(0);
  });
});

describe("computePopularityScore", () => {
  it("is 0 with no activity, so callers can tell 'unknown' from 'unpopular'", () => {
    expect(computePopularityScore({ views: [], bookings: [] }, NOW)).toBe(0);
  });

  it("weights a fresh view and a fresh booking by their configured weights", () => {
    const views = computePopularityScore({ views: [{ day: NOW, count: 4 }], bookings: [] }, NOW);
    const booking = computePopularityScore({ views: [], bookings: [{ day: NOW, count: 1 }] }, NOW);

    expect(views).toBeCloseTo(4 * VIEW_WEIGHT, 4);
    expect(booking).toBeCloseTo(BOOKING_WEIGHT, 4);
  });

  it("ranks one booking above a pile of views, since bookings are the real signal", () => {
    const booked = computePopularityScore({ views: [], bookings: [{ day: NOW, count: 1 }] }, NOW);
    const browsed = computePopularityScore(
      { views: [{ day: NOW, count: BOOKING_WEIGHT - 1 }], bookings: [] },
      NOW
    );

    expect(booked).toBeGreaterThan(browsed);
  });

  it("counts a cancelled booking as interest, but well below a surviving one", () => {
    const cancelled = computePopularityScore(
      { views: [], bookings: [], cancelledBookings: [{ day: NOW, count: 1 }] },
      NOW
    );

    expect(cancelled).toBeCloseTo(CANCELLED_BOOKING_WEIGHT, 4);
    expect(cancelled).toBeGreaterThan(0);
    expect(cancelled).toBeLessThan(BOOKING_WEIGHT);
  });

  it("ranks recent activity above the same amount of older activity", () => {
    const recent = computePopularityScore({ views: [{ day: daysAgo(1), count: 10 }], bookings: [] }, NOW);
    const older = computePopularityScore({ views: [{ day: daysAgo(40), count: 10 }], bookings: [] }, NOW);

    expect(recent).toBeGreaterThan(older);
    expect(older).toBeGreaterThan(0);
  });

  it("ignores activity that has aged out of the window entirely", () => {
    const score = computePopularityScore(
      {
        views: [{ day: daysAgo(POPULARITY_WINDOW_DAYS + 1), count: 500 }],
        bookings: [{ day: daysAgo(POPULARITY_WINDOW_DAYS + 5), count: 20 }],
      },
      NOW
    );

    expect(score).toBe(0);
  });

  it("sums across days and event types", () => {
    const score = computePopularityScore(
      {
        views: [
          { day: NOW, count: 3 },
          { day: daysAgo(POPULARITY_HALF_LIFE_DAYS), count: 4 },
        ],
        bookings: [{ day: daysAgo(POPULARITY_HALF_LIFE_DAYS), count: 1 }],
      },
      NOW
    );

    // 3 fresh views + 4 half-weight views + 1 half-weight booking
    expect(score).toBeCloseTo(3 + 2 + BOOKING_WEIGHT / 2, 3);
  });
});
