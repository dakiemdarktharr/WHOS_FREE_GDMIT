/**
 * Shared domain types for the Phase 1 backend.
 *
 * These mirror the shapes documented in /docs (ARCHITECTURE.md,
 * API_ROUTES.md, DATABASE_SCHEMA.md) and are the single source of truth
 * for the calculator, services, and socket payloads.
 */

export type RoomStatus = "COLLECTING" | "COMPUTING" | "FINISHED";

/** One calendar day of busy hours, expressed in the user's IANA timezone. */
export interface BusyDay {
  /** Local calendar date in the user's timezone, YYYY-MM-DD. */
  date: string;
  /** Unique integers in the inclusive range 0..23. An empty array marks a fully-free day. */
  hours: number[];
}

/** The subset of a Schedule document the calculator consumes. */
export interface MemberSchedule {
  userId: string;
  userTimezone: string;
  busySlots: BusyDay[];
}

export interface Recommendation {
  /** UTC instant at which the recommended one-hour slot starts. */
  startsAtUtc: string;
  /** Number of members busy during this slot. */
  busyCount: number;
  /** Number of members free during this slot. */
  availableCount: number;
}

export interface SharedWindow {
  start: string;
  end: string;
}

export interface CalculationResult {
  /** Intersection of submitted member date windows, or null when there is none. */
  sharedWindow: SharedWindow | null;
  /** Top ranked one-hour slots, lowest busyCount first, then earliest UTC first. */
  recommendations: Recommendation[];
  /** Human-readable note when the result needs context (empty intersection, no all-free slot). */
  explanation: string | null;
}

/** Broadcast payload for `room:user_updated`. */
export interface UserUpdatedPayload {
  userId: string;
  userName: string;
  isSubmitted: boolean;
  memberCount: number;
  submittedCount: number;
}

/** Broadcast payload for `room:state_change`. */
export interface StateChangePayload {
  status: RoomStatus;
  resultVersion: number;
  result?: CalculationResult | null;
}
