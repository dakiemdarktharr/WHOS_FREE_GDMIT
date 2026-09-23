import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recommendedTimeSpans } from "../services/roomSnapshot.js";
import type { Recommendation } from "../lib/types.js";

function slot(hour: number, busyCount: number): Recommendation {
  return {
    startsAtUtc: `2026-09-25T${String(hour).padStart(2, "0")}:00:00.000Z`,
    busyCount,
    availableCount: 2 - busyCount,
  };
}

describe("recommendedTimeSpans", () => {
  it("groups adjacent hours only when the same named people are free", () => {
    const spans = recommendedTimeSpans(
      [slot(8, 0), slot(10, 0), slot(11, 0), slot(9, 1), slot(12, 1)],
      [
        { userId: "sam", userName: "Sam", userTimezone: "UTC", isSubmitted: true,
          busySlots: [{ date: "2026-09-25", hours: [9] }] },
        { userId: "alex", userName: "Alex", userTimezone: "UTC", isSubmitted: true,
          busySlots: [{ date: "2026-09-25", hours: [12] }] },
      ],
    );

    assert.deepEqual(spans.map(({ startsAtUtc, endsAtUtc, availableMembers }) => ({
      startsAtUtc, endsAtUtc, free: availableMembers.map(({ userName }) => userName),
    })), [
      { startsAtUtc: "2026-09-25T10:00:00.000Z", endsAtUtc: "2026-09-25T12:00:00.000Z", free: ["Sam", "Alex"] },
      { startsAtUtc: "2026-09-25T08:00:00.000Z", endsAtUtc: "2026-09-25T09:00:00.000Z", free: ["Sam", "Alex"] },
      { startsAtUtc: "2026-09-25T09:00:00.000Z", endsAtUtc: "2026-09-25T10:00:00.000Z", free: ["Alex"] },
      { startsAtUtc: "2026-09-25T12:00:00.000Z", endsAtUtc: "2026-09-25T13:00:00.000Z", free: ["Sam"] },
    ]);
  });

  it("uses each member's timezone to determine who is free", () => {
    const spans = recommendedTimeSpans(
      [slot(10, 1), slot(11, 0)],
      [
        { userId: "sam", userName: "Sam", userTimezone: "Asia/Saigon", isSubmitted: true,
          busySlots: [{ date: "2026-09-25", hours: [17] }] },
        { userId: "alex", userName: "Alex", userTimezone: "UTC", isSubmitted: true,
          busySlots: [{ date: "2026-09-25", hours: [] }] },
      ],
    );
    assert.deepEqual(spans.map((span) => span.availableMembers.map((member) => member.userName)),
      [["Sam", "Alex"], ["Alex"]]);
    assert.equal(JSON.stringify(spans).includes("busySlots"), false);
  });
});
