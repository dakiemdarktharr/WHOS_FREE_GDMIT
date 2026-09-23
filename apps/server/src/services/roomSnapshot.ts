import type { BusyDay, Recommendation } from "../lib/types.js";
import { localHourToUtcIsos } from "../lib/time.js";

export interface RoomMember {
  userId: string;
  userName: string;
  isSubmitted: boolean;
}

export interface SnapshotSchedule extends RoomMember {
  userTimezone: string;
  busySlots: BusyDay[];
}

export interface TimeSpan {
  startsAtUtc: string;
  endsAtUtc: string;
  busyCount: number;
  availableCount: number;
  availableMembers: Pick<RoomMember, "userId" | "userName">[];
}

/** Derive named availability from the authoritative saved schedules. */
export function recommendedTimeSpans(
  recommendations: Recommendation[],
  schedules: SnapshotSchedule[],
): TimeSpan[] {
  const submitted = schedules.filter((schedule) => schedule.isSubmitted);
  const busyByUser = new Map<string, Set<string>>();
  for (const schedule of submitted) {
    const busy = new Set<string>();
    for (const day of schedule.busySlots) {
      for (const hour of day.hours) {
        for (const instant of localHourToUtcIsos(day.date, hour, schedule.userTimezone)) {
          busy.add(instant);
        }
      }
    }
    busyByUser.set(schedule.userId, busy);
  }

  const chronological = [...recommendations].sort((a, b) =>
    a.startsAtUtc.localeCompare(b.startsAtUtc),
  );
  const spans: TimeSpan[] = [];
  for (const slot of chronological) {
    const availableMembers = submitted
      .filter((member) => !busyByUser.get(member.userId)?.has(slot.startsAtUtc))
      .map(({ userId, userName }) => ({ userId, userName }));
    const endsAtUtc = new Date(Date.parse(slot.startsAtUtc) + 3_600_000).toISOString();
    const previous = spans.at(-1);
    if (
      previous?.endsAtUtc === slot.startsAtUtc &&
      previous.busyCount === slot.busyCount &&
      previous.availableMembers.length === availableMembers.length &&
      previous.availableMembers.every((member, index) => member.userId === availableMembers[index].userId)
    ) {
      previous.endsAtUtc = endsAtUtc;
    } else {
      spans.push({
        startsAtUtc: slot.startsAtUtc,
        endsAtUtc,
        busyCount: slot.busyCount,
        availableCount: slot.availableCount,
        availableMembers,
      });
    }
  }

  return spans.sort((a, b) =>
    a.busyCount - b.busyCount ||
    (Date.parse(b.endsAtUtc) - Date.parse(b.startsAtUtc)) -
      (Date.parse(a.endsAtUtc) - Date.parse(a.startsAtUtc)) ||
    a.startsAtUtc.localeCompare(b.startsAtUtc),
  );
}
