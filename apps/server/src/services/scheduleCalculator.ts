import type {
  CalculationResult,
  MemberSchedule,
  Recommendation,
  SharedWindow,
} from "../lib/types.js";
import { enumerateDates, isValidCalendarDate, localHourToUtcIso } from "../lib/time.js";

/** Number of ranked slots returned as recommendations. */
export const TOP_RESULT_COUNT = 12;

/**
 * Overlapping date boundary algorithm, per docs/ARCHITECTURE.md:
 *
 * 1. For every member, derive their inclusive local window from the earliest
 *    and latest `busySlots[].date`. A member with no saved days constrains
 *    nothing and is treated as free everywhere.
 * 2. candidateStart = max(memberWindowStart), candidateEnd = min(memberWindowEnd).
 *    An empty intersection yields an empty result with an explanation.
 * 3. Enumerate every local calendar day in the intersection and convert each
 *    member's 0..23 local hours to UTC instants in that member's IANA
 *    timezone. Each distinct UTC instant is a candidate one-hour slot.
 * 4. busyCount = members whose normalized UTC busy set contains the slot.
 *    Rank ascending by busyCount, then ascending by UTC instant.
 *
 * Raw local hour integers are never compared across timezones; every
 * comparison happens on normalized UTC instants.
 */
export interface FullRanking {
  sharedWindow: SharedWindow | null;
  /** Every candidate slot inside the window, fully ranked (not capped). */
  recommendations: Recommendation[];
}

/**
 * Build and rank the complete candidate-slot list for an intersecting
 * window. Exported separately from `calculateScheduleResult` so the
 * ranking is testable independently of the top-N cap.
 */
export function rankCandidateSlots(schedules: MemberSchedule[]): FullRanking {
  const sharedWindow = deriveSharedWindow(schedules);
  if (sharedWindow === null) {
    return { sharedWindow: null, recommendations: [] };
  }

  // Normalized busy set per member: UTC instants of every busy (date, hour).
  const busySets = schedules.map((schedule) => {
    const instants = new Set<string>();
    for (const day of schedule.busySlots) {
      if (!isValidCalendarDate(day.date)) continue;
      for (const hour of day.hours) {
        if (hour < 0 || hour > 23) continue;
        instants.add(localHourToUtcIso(day.date, hour, schedule.userTimezone));
      }
    }
    return instants;
  });

  // Candidate UTC instants: every local hour of every intersecting day as
  // seen in each member's timezone. A Set deduplicates instants that
  // coincide, including members sharing a timezone.
  const dates = enumerateDates(sharedWindow.start, sharedWindow.end);
  const candidates = new Set<string>();
  for (const schedule of schedules) {
    for (const date of dates) {
      for (let hour = 0; hour < 24; hour += 1) {
        candidates.add(localHourToUtcIso(date, hour, schedule.userTimezone));
      }
    }
  }

  const recommendations: Recommendation[] = [];
  for (const startsAtUtc of candidates) {
    let busyCount = 0;
    for (const busySet of busySets) {
      if (busySet.has(startsAtUtc)) busyCount += 1;
    }
    recommendations.push({
      startsAtUtc,
      busyCount,
      availableCount: schedules.length - busyCount,
    });
  }

  recommendations.sort(
    (a, b) =>
      a.busyCount - b.busyCount ||
      (a.startsAtUtc < b.startsAtUtc ? -1 : a.startsAtUtc > b.startsAtUtc ? 1 : 0),
  );

  return { sharedWindow, recommendations };
}

export function calculateScheduleResult(schedules: MemberSchedule[]): CalculationResult {
  if (schedules.length === 0) {
    return {
      sharedWindow: null,
      recommendations: [],
      explanation: "No schedules have been submitted yet.",
    };
  }

  const { sharedWindow, recommendations } = rankCandidateSlots(schedules);
  if (sharedWindow === null) {
    return {
      sharedWindow: null,
      recommendations: [],
      explanation: "No shared date window exists across the submitted schedules.",
    };
  }

  const top = recommendations.slice(0, TOP_RESULT_COUNT);

  // Most-people availability: when no slot works for every member, the top
  // ranked slots are the minimum-conflict ones, which needs context.
  const explanation =
    top.length > 0 && top[0].busyCount > 0
      ? "No slot works for every member; showing the least-conflict options."
      : null;

  return { sharedWindow, recommendations: top, explanation };
}

/**
 * Intersection of submitted member windows. Returns null when the
 * intersection is empty or no member constrains a window.
 */
export function deriveSharedWindow(schedules: MemberSchedule[]): SharedWindow | null {
  let candidateStart: string | null = null;
  let candidateEnd: string | null = null;

  for (const schedule of schedules) {
    const days = schedule.busySlots
      .map((day) => day.date)
      .filter(isValidCalendarDate)
      .sort();
    if (days.length === 0) continue;
    const memberStart = days[0];
    const memberEnd = days[days.length - 1];
    if (candidateStart === null || memberStart > candidateStart) {
      candidateStart = memberStart;
    }
    if (candidateEnd === null || memberEnd < candidateEnd) {
      candidateEnd = memberEnd;
    }
  }

  if (candidateStart === null || candidateEnd === null || candidateStart > candidateEnd) {
    return null;
  }
  return { start: candidateStart, end: candidateEnd };
}
