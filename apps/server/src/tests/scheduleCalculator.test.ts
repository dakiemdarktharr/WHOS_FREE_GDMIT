import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MemberSchedule, Recommendation } from "../lib/types.js";
import { calculateScheduleResult, deriveSharedWindow, rankCandidateSlots, TOP_RESULT_COUNT } from "../services/scheduleCalculator.js";

const SAIGON = "Asia/Saigon";
const LOS_ANGELES = "America/Los_Angeles";

function member(
  userId: string,
  userTimezone: string,
  busySlots: MemberSchedule["busySlots"],
): MemberSchedule {
  return { userId, userTimezone, busySlots };
}

function recommendationByStart(
  recommendations: Recommendation[],
  startsAtUtc: string,
): Recommendation | undefined {
  return recommendations.find((item) => item.startsAtUtc === startsAtUtc);
}

describe("deriveSharedWindow", () => {
  it("intersects member windows: max of starts, min of ends", () => {
    const window = deriveSharedWindow([
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [9] },
        { date: "2026-06-03", hours: [9] },
      ]),
      member("b", SAIGON, [
        { date: "2026-06-02", hours: [] },
        { date: "2026-06-05", hours: [1] },
      ]),
    ]);
    assert.deepEqual(window, { start: "2026-06-02", end: "2026-06-03" });
  });

  it("returns null when the intersection is empty", () => {
    const window = deriveSharedWindow([
      member("a", SAIGON, [{ date: "2026-06-01", hours: [9] }]),
      member("b", SAIGON, [{ date: "2026-06-03", hours: [9] }]),
    ]);
    assert.equal(window, null);
  });

  it("derives a single-day window from single-day submissions", () => {
    const window = deriveSharedWindow([
      member("a", SAIGON, [{ date: "2026-06-01", hours: [] }]),
      member("b", SAIGON, [{ date: "2026-06-01", hours: [12] }]),
    ]);
    assert.deepEqual(window, { start: "2026-06-01", end: "2026-06-01" });
  });

  it("ignores members without any saved days", () => {
    const window = deriveSharedWindow([
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [9] },
        { date: "2026-06-02", hours: [] },
      ]),
      member("b", SAIGON, []),
    ]);
    assert.deepEqual(window, { start: "2026-06-01", end: "2026-06-02" });
  });

  it("returns null when no member has saved days", () => {
    assert.equal(deriveSharedWindow([member("a", SAIGON, [])]), null);
    assert.equal(deriveSharedWindow([]), null);
  });
});

describe("calculateScheduleResult", () => {
  it("handles an empty schedule list safely", () => {
    const result = calculateScheduleResult([]);
    assert.equal(result.sharedWindow, null);
    assert.deepEqual(result.recommendations, []);
    assert.ok(result.explanation);
  });

  it("returns an explanatory empty result for an empty date intersection", () => {
    const result = calculateScheduleResult([
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [9] },
        { date: "2026-06-02", hours: [9] },
      ]),
      member("b", SAIGON, [
        { date: "2026-06-03", hours: [10] },
        { date: "2026-06-04", hours: [10] },
      ]),
    ]);
    assert.equal(result.sharedWindow, null);
    assert.deepEqual(result.recommendations, []);
    assert.ok(result.explanation);
  });

  it("counts busy-hour conflicts per member within the shared window", () => {
    const schedules = [
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [9, 10] },
        { date: "2026-06-02", hours: [] },
      ]),
      member("b", SAIGON, [{ date: "2026-06-01", hours: [10, 11] }]),
    ];
    const result = calculateScheduleResult(schedules);
    const ranking = rankCandidateSlots(schedules);

    assert.deepEqual(result.sharedWindow, { start: "2026-06-01", end: "2026-06-01" });
    assert.equal(result.recommendations.length, TOP_RESULT_COUNT);
    assert.equal(result.explanation, null);
    assert.equal(ranking.recommendations.length, 24);

    // Saigon is UTC+7 year-round: local hour h on Jun 1 starts at (h - 7) UTC.
    const hour0 = recommendationByStart(ranking.recommendations, "2026-05-31T17:00:00.000Z");
    const hour9 = recommendationByStart(ranking.recommendations, "2026-06-01T02:00:00.000Z");
    const hour10 = recommendationByStart(ranking.recommendations, "2026-06-01T03:00:00.000Z");
    const hour11 = recommendationByStart(ranking.recommendations, "2026-06-01T04:00:00.000Z");

    assert.deepEqual(hour0, { startsAtUtc: "2026-05-31T17:00:00.000Z", busyCount: 0, availableCount: 2 });
    assert.deepEqual(hour9, { startsAtUtc: "2026-06-01T02:00:00.000Z", busyCount: 1, availableCount: 1 });
    assert.deepEqual(hour10, { startsAtUtc: "2026-06-01T03:00:00.000Z", busyCount: 2, availableCount: 0 });
    assert.deepEqual(hour11, { startsAtUtc: "2026-06-01T04:00:00.000Z", busyCount: 1, availableCount: 1 });
  });

  it("ranks by ascending busyCount, then by ascending UTC instant", () => {
    const result = calculateScheduleResult([
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [9, 10] },
        { date: "2026-06-02", hours: [] },
      ]),
      member("b", SAIGON, [{ date: "2026-06-01", hours: [10, 11] }]),
    ]);

    for (let index = 1; index < result.recommendations.length; index += 1) {
      const previous = result.recommendations[index - 1];
      const current = result.recommendations[index];
      assert.ok(
        previous.busyCount < current.busyCount ||
          (previous.busyCount === current.busyCount && previous.startsAtUtc <= current.startsAtUtc),
        `expected ranking at ${index}: ${JSON.stringify(previous)} then ${JSON.stringify(current)}`,
      );
    }
    assert.equal(result.recommendations[0].busyCount, 0);
  });

  it("normalizes different timezones to UTC instants instead of comparing local hours", () => {
    // Saigon is UTC+7, Los Angeles in June is UTC-7. Both members mark
    // local hour 10 busy; those are different UTC instants.
    const schedules = [
      member("a", SAIGON, [{ date: "2026-06-01", hours: [10] }]),
      member("b", LOS_ANGELES, [{ date: "2026-06-01", hours: [10] }]),
    ];
    const result = calculateScheduleResult(schedules);
    const ranking = rankCandidateSlots(schedules);

    assert.deepEqual(result.sharedWindow, { start: "2026-06-01", end: "2026-06-01" });

    // A's 10:00 local = 03:00Z: busy for A only.
    assert.deepEqual(recommendationByStart(ranking.recommendations, "2026-06-01T03:00:00.000Z"), {
      startsAtUtc: "2026-06-01T03:00:00.000Z",
      busyCount: 1,
      availableCount: 1,
    });
    // B's 10:00 local = 17:00Z: busy for B only.
    assert.deepEqual(recommendationByStart(ranking.recommendations, "2026-06-01T17:00:00.000Z"), {
      startsAtUtc: "2026-06-01T17:00:00.000Z",
      busyCount: 1,
      availableCount: 1,
    });
    // 10:00Z is A's 17:00 and B's 03:00: free for both. Two timezones
    // viewing one date produce 24 + 24 - 10 overlapping = 38 distinct
    // candidate instants.
    assert.equal(ranking.recommendations.length, 38);
    assert.deepEqual(recommendationByStart(ranking.recommendations, "2026-06-01T10:00:00.000Z"), {
      startsAtUtc: "2026-06-01T10:00:00.000Z",
      busyCount: 0,
      availableCount: 2,
    });
  });

  it("ranks the actual 23 and 25 hours on daylight saving transition days", () => {
    const spring = rankCandidateSlots([
      member("a", LOS_ANGELES, [{ date: "2026-03-08", hours: [2] }]),
    ]);
    assert.equal(spring.recommendations.length, 23);
    assert.ok(spring.recommendations.every((slot) => slot.busyCount === 0));

    const fall = rankCandidateSlots([
      member("a", LOS_ANGELES, [{ date: "2026-11-01", hours: [1] }]),
    ]);
    assert.equal(fall.recommendations.length, 25);
    assert.equal(fall.recommendations.filter((slot) => slot.busyCount === 1).length, 2);
  });

  it("treats a member with no saved days as free everywhere", () => {
    // B has no saved days: it constrains nothing and is never busy, so
    // the window comes from A alone and every slot counts A's hours only.
    const schedules = [
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [9] },
        { date: "2026-06-02", hours: [] },
      ]),
      member("b", SAIGON, []),
    ];
    const result = calculateScheduleResult(schedules);
    const ranking = rankCandidateSlots(schedules);

    assert.deepEqual(result.sharedWindow, { start: "2026-06-01", end: "2026-06-02" });
    // Every slot is free for B; the top ranked slot is free for both.
    assert.equal(result.recommendations[0].busyCount, 0);
    assert.equal(result.recommendations[0].availableCount, 2);
    // A's busy local hour 9 (02:00Z) counts A only.
    assert.deepEqual(recommendationByStart(ranking.recommendations, "2026-06-01T02:00:00.000Z"), {
      startsAtUtc: "2026-06-01T02:00:00.000Z",
      busyCount: 1,
      availableCount: 1,
    });
  });

  it("treats a day with empty hours as a fully-free day inside the window", () => {
    const result = calculateScheduleResult([
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [] },
        { date: "2026-06-02", hours: [5] },
      ]),
      member("b", SAIGON, [{ date: "2026-06-01", hours: [] }]),
    ]);

    assert.deepEqual(result.sharedWindow, { start: "2026-06-01", end: "2026-06-01" });
    assert.equal(result.recommendations[0].busyCount, 0);
    assert.equal(result.recommendations[0].availableCount, 2);
  });

  it("falls back to most-people availability when no all-free slot exists", () => {
    const result = calculateScheduleResult([
      member("a", SAIGON, [
        {
          date: "2026-06-01",
          hours: Array.from({ length: 24 }, (_, hour) => hour),
        },
      ]),
      member("b", SAIGON, [
        {
          date: "2026-06-01",
          hours: Array.from({ length: 23 }, (_, hour) => hour + 1),
        },
      ]),
    ]);

    assert.equal(result.recommendations.length, TOP_RESULT_COUNT);
    assert.equal(result.recommendations[0].busyCount, 1);
    assert.equal(result.recommendations[0].availableCount, 1);
    // The least-conflict slot is the only hour A alone is busy: local 00:00.
    assert.equal(result.recommendations[0].startsAtUtc, "2026-05-31T17:00:00.000Z");
    assert.ok(result.explanation, "expected an explanation when only least-conflict slots exist");
  });

  it("caps recommendations at the documented top result count", () => {
    const result = calculateScheduleResult([
      member("a", SAIGON, [
        { date: "2026-06-01", hours: [] },
        { date: "2026-06-07", hours: [] },
      ]),
      member("b", SAIGON, [{ date: "2026-06-01", hours: [] }]),
    ]);
    assert.equal(result.recommendations.length, TOP_RESULT_COUNT);
  });
});
