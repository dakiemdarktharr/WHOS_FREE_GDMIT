import { z } from "zod";
import type { BusyDay } from "./types.js";
import { isIanaTimezone, isValidCalendarDate } from "./time.js";
import { ROOM_CODE_PATTERN } from "./roomCode.js";

/** User identifiers are stable anonymous browser values, not credentials. */
export const userIdSchema = z.string().trim().min(1).max(64);

export const userNameSchema = z.string().trim().min(1).max(40);

export const roomCodeSchema = z
  .string()
  .regex(ROOM_CODE_PATTERN, "Room code must be exactly five numeric characters.");

export const timezoneSchema = z
  .string()
  .min(1)
  .refine(isIanaTimezone, "Must be a valid IANA timezone identifier.");

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidCalendarDate, "Must be a real calendar date.");

const hourSchema = z.number().int().min(0).max(23);

const busyDaySchema = z.object({
  date: dateStringSchema,
  hours: z.array(hourSchema).max(24),
});

const busySlotsSchema = z.array(busyDaySchema).max(366);

const memberIdentitySchema = z.object({
  userId: userIdSchema,
  userName: userNameSchema,
});

export const createRoomSchema = z.object({
  userId: userIdSchema,
  userName: userNameSchema,
  creatorTimezone: timezoneSchema,
});

export const joinRoomSchema = z.object({
  roomCode: roomCodeSchema,
  userId: userIdSchema,
  userName: userNameSchema,
  userTimezone: timezoneSchema,
});

export const submitScheduleSchema = z.object({
  roomCode: roomCodeSchema,
  roomId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "roomId must be a 24-character hexadecimal ObjectId.")
    .optional(),
  userId: userIdSchema,
  userName: userNameSchema,
  userTimezone: timezoneSchema,
  busySlots: busySlotsSchema,
});

export const roomJoinSocketSchema = z.object({
  roomCode: roomCodeSchema,
  userId: userIdSchema,
  userName: userNameSchema,
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type SubmitScheduleInput = z.infer<typeof submitScheduleSchema>;
export type RoomJoinSocketInput = z.infer<typeof roomJoinSocketSchema>;

/**
 * Normalize a validated busySlots payload before persistence:
 * duplicate dates are merged (union of hours), hours are deduplicated and
 * sorted ascending, and days are ordered by date.
 */
export function normalizeBusySlots(slots: BusyDay[]): BusyDay[] {
  const hoursByDate = new Map<string, Set<number>>();
  for (const slot of slots) {
    const hours = hoursByDate.get(slot.date) ?? new Set<number>();
    for (const hour of slot.hours) hours.add(hour);
    hoursByDate.set(slot.date, hours);
  }
  return [...hoursByDate.entries()]
    .map(([date, hours]) => ({ date, hours: [...hours].sort((a, b) => a - b) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
