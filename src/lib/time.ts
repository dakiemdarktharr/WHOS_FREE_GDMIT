import { DateTime } from "luxon";

export function isIanaTimezone(value: string): boolean {
  return value.length > 0 && DateTime.now().setZone(value).isValid;
}

export function localHourToUtc(date: string, hour: number, timezone: string): string {
  return DateTime.fromISO(date, { zone: timezone }).startOf("day").plus({ hours: hour }).toUTC().toISO() ?? "";
}

export function localDayBoundaryUtc(date: string, timezone: string, end = false): string {
  const day = DateTime.fromISO(date, { zone: timezone });
  return (end ? day.endOf("day") : day.startOf("day")).toUTC().toISO() ?? "";
}

export function currentMonthLabel(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat("LLLL yyyy");
}
