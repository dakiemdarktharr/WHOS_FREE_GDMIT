/**
 * Timezone-safe calendar helpers.
 *
 * All conversions go through `Intl.DateTimeFormat`, so there is no bundled
 * timezone database. Local wall-clock values are converted to UTC with a
 * fixed-point iteration over the timezone offset, which also settles
 * deterministically on DST transition days.
 */

const DAY_MS = 86_400_000;

/** True when `value` is a valid IANA timezone identifier. */
export function isIanaTimezone(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timezone` at the given UTC instant, in milliseconds (local - utc). */
function timezoneOffsetMs(timezone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const value = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    return part ? Number(part.value) : 0;
  };
  const wallAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return wallAsUtc - utcMs;
}

/** Every UTC instant represented by a local hour (zero during a DST gap, two during a fold). */
export function localHourToUtcIsos(date: string, hour: number, timezone: string): string[] {
  const [year, month, day] = date.split("-").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour);
  const offsets = new Set([
    timezoneOffsetMs(timezone, wallAsUtc - DAY_MS),
    timezoneOffsetMs(timezone, wallAsUtc),
    timezoneOffsetMs(timezone, wallAsUtc + DAY_MS),
  ]);
  return [...offsets]
    .map((offset) => wallAsUtc - offset)
    .filter((utcMs) => timezoneOffsetMs(timezone, utcMs) === wallAsUtc - utcMs)
    .sort((a, b) => a - b)
    .map((utcMs) => new Date(utcMs).toISOString());
}

/**
 * Convert a local calendar date + hour in `timezone` to a UTC ISO string.
 * Non-existent local times (spring-forward gap) settle on a valid adjacent
 * instant instead of throwing.
 */
export function localHourToUtcIso(date: string, hour: number, timezone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  let utcMs = wallAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const next = wallAsUtc - timezoneOffsetMs(timezone, utcMs);
    if (next === utcMs) break;
    utcMs = next;
  }
  return new Date(utcMs).toISOString();
}

/** Strict check that `date` is a real calendar date in YYYY-MM-DD form. */
export function isValidCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Pure calendar arithmetic: number of days since the epoch for a date string. */
export function dateToUtcDayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function utcDayNumberToDate(dayNumber: number): string {
  const utc = new Date(dayNumber * DAY_MS);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** All calendar dates from `start` through `end` inclusive; empty when reversed. */
export function enumerateDates(start: string, end: string): string[] {
  const startNumber = dateToUtcDayNumber(start);
  const endNumber = dateToUtcDayNumber(end);
  const dates: string[] = [];
  for (let day = startNumber; day <= endNumber; day += 1) {
    dates.push(utcDayNumberToDate(day));
  }
  return dates;
}
