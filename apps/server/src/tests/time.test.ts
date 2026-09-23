import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateToUtcDayNumber,
  enumerateDates,
  isIanaTimezone,
  isValidCalendarDate,
  localHourToUtcIso,
  localHourToUtcIsos,
  utcDayNumberToDate,
} from "../lib/time.js";

describe("isIanaTimezone", () => {
  it("accepts valid IANA identifiers", () => {
    for (const timezone of [
      "Asia/Saigon",
      "Asia/Ho_Chi_Minh",
      "America/Los_Angeles",
      "America/New_York",
      "UTC",
      "Etc/GMT+7",
      "Europe/London",
    ]) {
      assert.equal(isIanaTimezone(timezone), true, timezone);
    }
  });

  it("rejects invalid identifiers and non-strings", () => {
    for (const timezone of ["", "Not/AZone", "Mars/Olympus", "Asia/Saigon ", "  ", "123"]) {
      assert.equal(isIanaTimezone(timezone), false, JSON.stringify(timezone));
    }
    assert.equal(isIanaTimezone(undefined as unknown as string), false);
  });
});

describe("localHourToUtcIso", () => {
  it("converts fixed-offset zones (Saigon, UTC+7)", () => {
    assert.equal(localHourToUtcIso("2026-06-01", 0, "Asia/Saigon"), "2026-05-31T17:00:00.000Z");
    assert.equal(localHourToUtcIso("2026-06-01", 9, "Asia/Saigon"), "2026-06-01T02:00:00.000Z");
    assert.equal(localHourToUtcIso("2026-06-01", 23, "Asia/Saigon"), "2026-06-01T16:00:00.000Z");
  });

  it("respects daylight saving offsets (Los Angeles: -7 in summer, -8 in winter)", () => {
    assert.equal(localHourToUtcIso("2026-06-01", 0, "America/Los_Angeles"), "2026-06-01T07:00:00.000Z");
    assert.equal(localHourToUtcIso("2026-06-01", 10, "America/Los_Angeles"), "2026-06-01T17:00:00.000Z");
    assert.equal(localHourToUtcIso("2026-01-15", 12, "America/Los_Angeles"), "2026-01-15T20:00:00.000Z");
  });

  it("settles on a valid instant for nonexistent DST spring-forward times", () => {
    // US DST starts 2026-03-08; 02:00 local does not exist in Los Angeles.
    // The fixed-point conversion collapses it onto one of the adjacent
    // valid instants (ICU picks the side of the transition edge).
    const iso = localHourToUtcIso("2026-03-08", 2, "America/Los_Angeles");
    assert.ok(!Number.isNaN(Date.parse(iso)), `expected a parseable instant, got ${iso}`);
    assert.ok(
      iso === "2026-03-08T09:00:00.000Z" || iso === "2026-03-08T10:00:00.000Z",
      `expected an adjacent valid instant, got ${iso}`,
    );
  });
});

describe("localHourToUtcIsos", () => {
  it("omits the nonexistent spring-forward hour", () => {
    assert.deepEqual(localHourToUtcIsos("2026-03-08", 2, "America/Los_Angeles"), []);
  });

  it("includes both occurrences of the fall-back hour", () => {
    assert.deepEqual(localHourToUtcIsos("2026-11-01", 1, "America/Los_Angeles"), [
      "2026-11-01T08:00:00.000Z",
      "2026-11-01T09:00:00.000Z",
    ]);
  });
});

describe("isValidCalendarDate", () => {
  it("accepts real calendar dates", () => {
    for (const date of ["2026-06-01", "2026-12-31", "2024-02-29", "2026-01-01"]) {
      assert.equal(isValidCalendarDate(date), true, date);
    }
  });

  it("rejects malformed or impossible dates", () => {
    for (const date of [
      "2026-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-09-31",
      "2026-6-1",
      "not-a-date",
      "",
      "20260601",
    ]) {
      assert.equal(isValidCalendarDate(date), false, JSON.stringify(date));
    }
  });
});

describe("date enumeration", () => {
  it("enumerates every day in the inclusive range", () => {
    assert.deepEqual(enumerateDates("2026-06-01", "2026-06-03"), [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
    assert.deepEqual(enumerateDates("2026-06-01", "2026-06-01"), ["2026-06-01"]);
    assert.deepEqual(enumerateDates("2026-01-31", "2026-02-02"), [
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("returns an empty list when the range is reversed", () => {
    assert.deepEqual(enumerateDates("2026-06-03", "2026-06-01"), []);
  });

  it("round-trips date strings through day numbers", () => {
    for (const date of ["2026-06-01", "2026-01-01", "2026-12-31", "2024-02-29"]) {
      assert.equal(utcDayNumberToDate(dateToUtcDayNumber(date)), date);
    }
  });
});
