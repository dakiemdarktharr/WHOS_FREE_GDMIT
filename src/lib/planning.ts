import { DateTime } from "luxon";
import type { AvailabilityUpdate, Member, Recommendation } from "@/domain/types";

export function calculateRecommendations(
  members: Member[],
  availability: AvailabilityUpdate[],
): Recommendation[] {
  const windows = members
    .map((member) => availability.find((item) => item.participantId === member.participantId))
    .filter((item): item is AvailabilityUpdate => Boolean(item));
  if (!windows.length || windows.length !== members.length) return [];

  const start = windows.reduce((latest, item) => item.windowStart > latest ? item.windowStart : latest, windows[0].windowStart);
  const end = windows.reduce((earliest, item) => item.windowEnd < earliest ? item.windowEnd : earliest, windows[0].windowEnd);
  const startAt = DateTime.fromISO(start).startOf("hour");
  const endAt = DateTime.fromISO(end).endOf("day");
  if (!startAt.isValid || !endAt.isValid || startAt > endAt) return [];

  const recommendations: Recommendation[] = [];
  for (let cursor = startAt; cursor <= endAt; cursor = cursor.plus({ hours: 1 })) {
    const startsAtUtc = cursor.toUTC().toISO();
    if (!startsAtUtc) continue;
    const busyCount = windows.reduce((count, item) => count + (item.busyUtc.includes(startsAtUtc) ? 1 : 0), 0);
    recommendations.push({ startsAtUtc, busyCount, availableCount: members.length - busyCount });
  }
  return recommendations.sort((a, b) => a.busyCount - b.busyCount || a.startsAtUtc.localeCompare(b.startsAtUtc)).slice(0, 12);
}
