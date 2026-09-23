import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRoomSchema,
  joinRoomSchema,
  normalizeBusySlots,
  roomCodeSchema,
  submitScheduleSchema,
} from "../lib/validation.js";

function validSubmission(overrides: Record<string, unknown> = {}) {
  return {
    roomCode: "48307",
    userId: "browser-generated-uuid",
    userName: "Alex",
    userTimezone: "America/Los_Angeles",
    busySlots: [
      { date: "2026-09-24", hours: [9, 10, 11] },
      { date: "2026-09-25", hours: [] },
    ],
    ...overrides,
  };
}

describe("submitScheduleSchema", () => {
  it("accepts the documented submission payload", () => {
    const parsed = submitScheduleSchema.safeParse(validSubmission());
    assert.equal(parsed.success, true);
  });

  it("accepts a fully-free day (empty hours array)", () => {
    const parsed = submitScheduleSchema.safeParse(
      validSubmission({ busySlots: [{ date: "2026-09-24", hours: [] }] }),
    );
    assert.equal(parsed.success, true);
  });

  it("accepts an optional matching roomId ObjectId", () => {
    const parsed = submitScheduleSchema.safeParse(
      validSubmission({ roomId: "66f0d31f37fa2b2f1d012345" }),
    );
    assert.equal(parsed.success, true);
  });

  it("rejects hours outside 0..23", () => {
    for (const hours of [[24], [-1], [23, 24], [100]]) {
      const parsed = submitScheduleSchema.safeParse(
        validSubmission({ busySlots: [{ date: "2026-09-24", hours }] }),
      );
      assert.equal(parsed.success, false, `hours ${JSON.stringify(hours)} should be rejected`);
    }
  });

  it("rejects non-integer hours", () => {
    for (const hours of [[1.5], ["9"], [NaN], [null]]) {
      const parsed = submitScheduleSchema.safeParse(
        validSubmission({ busySlots: [{ date: "2026-09-24", hours }] }),
      );
      assert.equal(parsed.success, false, `hours ${JSON.stringify(hours)} should be rejected`);
    }
  });

  it("rejects malformed and impossible dates", () => {
    for (const date of ["2026-9-04", "not-a-date", "2026-13-01", "2026-02-29", ""]) {
      const parsed = submitScheduleSchema.safeParse(
        validSubmission({ busySlots: [{ date, hours: [9] }] }),
      );
      assert.equal(parsed.success, false, `date ${JSON.stringify(date)} should be rejected`);
    }
  });

  it("rejects invalid timezones", () => {
    for (const userTimezone of ["Mars/Olympus", "Not/AZone", "", "GMT+7"]) {
      const parsed = submitScheduleSchema.safeParse(validSubmission({ userTimezone }));
      assert.equal(parsed.success, false, `timezone ${JSON.stringify(userTimezone)} should be rejected`);
    }
  });

  it("rejects malformed room codes", () => {
    for (const roomCode of ["1234", "123456", "1234a", "ABCDE", "", " 12345"]) {
      const parsed = submitScheduleSchema.safeParse(validSubmission({ roomCode }));
      assert.equal(parsed.success, false, `roomCode ${JSON.stringify(roomCode)} should be rejected`);
    }
  });

  it("rejects a malformed roomId", () => {
    for (const roomId of ["nope", "66f0d31f", "zzf0d31f37fa2b2f1d012345"]) {
      const parsed = submitScheduleSchema.safeParse(validSubmission({ roomId }));
      assert.equal(parsed.success, false, `roomId ${JSON.stringify(roomId)} should be rejected`);
    }
  });

  it("rejects missing or malformed busySlots", () => {
    assert.equal(submitScheduleSchema.safeParse(validSubmission({ busySlots: undefined })).success, false);
    assert.equal(submitScheduleSchema.safeParse(validSubmission({ busySlots: "nope" })).success, false);
    assert.equal(
      submitScheduleSchema.safeParse(validSubmission({ busySlots: [{ date: "2026-09-24" }] })).success,
      false,
      "missing hours array should be rejected",
    );
    assert.equal(
      submitScheduleSchema.safeParse(validSubmission({ busySlots: [{ hours: [9] }] })).success,
      false,
      "missing date should be rejected",
    );
  });
});

describe("roomCodeSchema", () => {
  it("accepts exactly five numeric characters", () => {
    for (const roomCode of ["00000", "12345", "99999"]) {
      assert.equal(roomCodeSchema.safeParse(roomCode).success, true, roomCode);
    }
  });

  it("rejects wrong lengths and non-numeric codes", () => {
    for (const roomCode of ["", "1234", "123456", "12a45", "１２３４５"]) {
      assert.equal(roomCodeSchema.safeParse(roomCode).success, false, JSON.stringify(roomCode));
    }
  });
});

describe("createRoomSchema and joinRoomSchema", () => {
  it("accept documented payloads", () => {
    assert.equal(
      createRoomSchema.safeParse({
        userId: "browser-generated-uuid",
        userName: "Sam",
        creatorTimezone: "Asia/Saigon",
      }).success,
      true,
    );
    assert.equal(
      joinRoomSchema.safeParse({
        roomCode: "48307",
        userId: "browser-generated-uuid",
        userName: "Alex",
        userTimezone: "America/Los_Angeles",
      }).success,
      true,
    );
  });

  it("reject missing, empty, or overlong names", () => {
    assert.equal(createRoomSchema.safeParse({ userId: "u", creatorTimezone: "UTC" }).success, false);
    assert.equal(
      createRoomSchema.safeParse({ userId: "u", userName: "   ", creatorTimezone: "UTC" }).success,
      false,
    );
    assert.equal(
      createRoomSchema.safeParse({
        userId: "u",
        userName: "x".repeat(41),
        creatorTimezone: "UTC",
      }).success,
      false,
    );
    assert.equal(
      joinRoomSchema.safeParse({ roomCode: "12345", userName: "Alex", userTimezone: "UTC" }).success,
      false,
      "missing userId should be rejected",
    );
  });
});

describe("normalizeBusySlots", () => {
  it("deduplicates and sorts hours, and orders days by date", () => {
    const normalized = normalizeBusySlots([
      { date: "2026-09-25", hours: [11, 9, 11] },
      { date: "2026-09-24", hours: [] },
    ]);
    assert.deepEqual(normalized, [
      { date: "2026-09-24", hours: [] },
      { date: "2026-09-25", hours: [9, 11] },
    ]);
  });

  it("merges duplicate dates as a union of hours", () => {
    const normalized = normalizeBusySlots([
      { date: "2026-09-24", hours: [9, 10] },
      { date: "2026-09-24", hours: [10, 12] },
    ]);
    assert.deepEqual(normalized, [{ date: "2026-09-24", hours: [9, 10, 12] }]);
  });

  it("returns an empty list for empty input", () => {
    assert.deepEqual(normalizeBusySlots([]), []);
  });
});
