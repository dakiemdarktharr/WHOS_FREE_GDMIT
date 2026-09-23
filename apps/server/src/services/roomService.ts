import mongoose from "mongoose";
import { Room, type RoomDocument } from "../models/Room.js";
import { Schedule } from "../models/Schedule.js";
import { AppError } from "../middleware/error.js";
import { generateUniqueRoomCode } from "../lib/roomCode.js";
import { normalizeBusySlots } from "../lib/validation.js";
import { calculateScheduleResult } from "./scheduleCalculator.js";
import { broadcastToRoom } from "../socket/index.js";
import { supportsTransactions } from "../db/connect.js";
import type {
  BusyDay,
  CalculationResult,
  RoomStatus,
  SharedWindow,
} from "../lib/types.js";

interface RoomCounts {
  memberCount: number;
  submittedCount: number;
}

async function countMembers(roomId: unknown, session?: mongoose.ClientSession | null): Promise<RoomCounts> {
  const options = session ? { session } : {};
  const [memberCount, submittedCount] = await Promise.all([
    Schedule.countDocuments({ roomId }, options),
    Schedule.countDocuments({ roomId, isSubmitted: true }, options),
  ]);
  return { memberCount, submittedCount };
}

function toBusySlots(doc: { busySlots: BusyDay[] }): BusyDay[] {
  return doc.busySlots.map((slot) => ({ date: slot.date, hours: [...slot.hours] }));
}

export interface CreateRoomResult {
  room: {
    roomId: string;
    roomCode: string;
    creatorTimezone: string;
    status: RoomStatus;
    createdAt: Date;
  };
  member: { userId: string; userName: string; isSubmitted: boolean };
}

/**
 * Create a room and register the creator as its first participant.
 * The database unique index is the final collision guard: a duplicate
 * insert is retried with a fresh cryptographically generated code.
 */
export async function createRoom(input: {
  userId: string;
  userName: string;
  creatorTimezone: string;
}): Promise<CreateRoomResult> {
  let created: RoomDocument | undefined;
  const roomCode = await generateUniqueRoomCode(async (code) => {
    created = await Room.create({ roomCode: code, creatorTimezone: input.creatorTimezone });
  });
  const room = created;
  if (!room) throw new AppError(500, "INTERNAL_ERROR", "Room creation failed.");

  await Schedule.findOneAndUpdate(
    { roomId: room._id, userId: input.userId },
    {
      $set: {
        userName: input.userName,
        userTimezone: input.creatorTimezone,
        busySlots: [],
        isSubmitted: false,
        updatedAt: new Date(),
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  broadcastToRoom(roomCode, "room:user_updated", {
    userId: input.userId,
    userName: input.userName,
    isSubmitted: false,
    memberCount: 1,
    submittedCount: 0,
  });

  return {
    room: {
      roomId: String(room._id),
      roomCode: room.roomCode,
      creatorTimezone: room.creatorTimezone,
      status: room.status,
      createdAt: room.createdAt,
    },
    member: { userId: input.userId, userName: input.userName, isSubmitted: false },
  };
}

export interface JoinRoomResult {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  memberCount: number;
  submittedCount: number;
}

/**
 * Join or refresh a room member. Unknown rooms 404; finished rooms reject
 * new members. A fresh member without a submission moves a COMPUTING room
 * back to COLLECTING.
 */
export async function joinRoom(input: {
  roomCode: string;
  userId: string;
  userName: string;
  userTimezone: string;
}): Promise<JoinRoomResult> {
  const room = await Room.findOne({ roomCode: input.roomCode });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found.");
  if (room.status === "FINISHED") {
    throw new AppError(409, "ROOM_FINISHED", "This room has already finished collecting schedules.");
  }

  const existing = await Schedule.findOne({ roomId: room._id, userId: input.userId });
  if (existing) {
    await Schedule.updateOne(
      { _id: existing._id },
      { $set: { userName: input.userName, userTimezone: input.userTimezone, updatedAt: new Date() } },
    );
  } else {
    await Schedule.create({
      roomId: room._id,
      userId: input.userId,
      userName: input.userName,
      userTimezone: input.userTimezone,
      busySlots: [],
      isSubmitted: false,
    });
    if (room.status === "COMPUTING") {
      room.status = "COLLECTING";
      await room.save();
    }
  }

  const { memberCount, submittedCount } = await countMembers(room._id);
  broadcastToRoom(input.roomCode, "room:user_updated", {
    userId: input.userId,
    userName: input.userName,
    isSubmitted: existing?.isSubmitted ?? false,
    memberCount,
    submittedCount,
  });

  return {
    roomId: String(room._id),
    roomCode: input.roomCode,
    status: room.status,
    memberCount,
    submittedCount,
  };
}

export interface SubmitScheduleResult {
  roomCode: string;
  status: RoomStatus;
  isSubmitted: true;
  submittedCount: number;
  memberCount: number;
}

interface FinalizedResult {
  resultVersion: number;
  result: CalculationResult;
}

/**
 * Atomically replace the caller's schedule and mark it submitted.
 *
 * The guard-and-write unit runs inside a transaction when the topology
 * supports one (Atlas / replica set / sharded). On a standalone local
 * MongoDB — where `mongoose.connection.transaction` would fail outright —
 * the same unit runs sequentially with idempotent writes and the result is
 * recomputed from a fresh read before FINISHED is broadcast, per
 * docs/DATABASE_SCHEMA.md.
 */
export async function submitSchedule(input: {
  roomCode: string;
  roomId?: string;
  userId: string;
  userName: string;
  userTimezone: string;
  busySlots: BusyDay[];
}): Promise<SubmitScheduleResult> {
  const room = await Room.findOne({ roomCode: input.roomCode });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found.");
  if (input.roomId && String(room._id) !== input.roomId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "roomId does not match the room for this roomCode.",
      { roomId: "Room identifier mismatch." },
    );
  }

  // Fast-path rejection for the common case (see the in-unit re-check below
  // for the race-safe guard).
  if (room.status === "FINISHED") {
    const membership = await Schedule.exists({ roomId: room._id, userId: input.userId });
    if (!membership) {
      throw new AppError(
        409,
        "ROOM_FINISHED",
        "This room has already finished collecting schedules.",
      );
    }
  }

  const busySlots = normalizeBusySlots(input.busySlots);

  // The membership guard and the writes run as one unit: a real transaction
  // when the topology supports one, otherwise sequential idempotent writes
  // with a fresh read before FINISHED (docs/DATABASE_SCHEMA.md fallback).
  const run = async (session: mongoose.ClientSession | null) => {
    const options = session ? { session } : {};

    // Re-checked inside the unit so a room finishing concurrently cannot
    // be raced into accepting a stranger's upsert. (Every member of a
    // FINISHED room is submitted by invariant, so existence suffices.)
    const freshRoom = await Room.findOne({ _id: room._id }, null, options);
    if (freshRoom?.status === "FINISHED") {
      const membershipCount = await Schedule.countDocuments(
        { roomId: room._id, userId: input.userId },
        options,
      );
      if (membershipCount === 0) {
        throw new AppError(
          409,
          "ROOM_FINISHED",
          "This room has already finished collecting schedules.",
        );
      }
    }

    await Schedule.findOneAndUpdate(
      { roomId: room._id, userId: input.userId },
      {
        $set: {
          userName: input.userName,
          userTimezone: input.userTimezone,
          busySlots,
          isSubmitted: true,
          updatedAt: new Date(),
        },
      },
      { upsert: true, setDefaultsOnInsert: true, ...options },
    );

    const { memberCount, submittedCount } = await countMembers(room._id, session);

    // Not every member has submitted: keep collecting.
    if (memberCount === 0 || submittedCount < memberCount) {
      await Room.updateOne({ _id: room._id }, { $set: { status: "COLLECTING" } }, options);
      return { status: "COLLECTING" as const, memberCount, submittedCount, finalized: null };
    }

    // All submitted: compute from a fresh read and finalize.
    await Room.updateOne({ _id: room._id }, { $set: { status: "COMPUTING" } }, options);
    const schedules = await Schedule.find(
      { roomId: room._id, isSubmitted: true },
      null,
      options,
    );
    const result = calculateScheduleResult(
      schedules.map((schedule) => ({
        userId: schedule.userId,
        userTimezone: schedule.userTimezone,
        busySlots: toBusySlots(schedule),
      })),
    );
    const updated = await Room.findOneAndUpdate(
      { _id: room._id },
      { $set: { status: "FINISHED", result }, $inc: { resultVersion: 1 } },
      { new: true, ...options },
    );
    if (!updated) throw new AppError(500, "INTERNAL_ERROR", "Room disappeared during computation.");
    return {
      status: "FINISHED" as const,
      memberCount,
      submittedCount,
      finalized: { resultVersion: updated.resultVersion, result },
    };
  };

  const finalized = (await supportsTransactions())
    ? await mongoose.connection.transaction(run)
    : await run(null);

  if (!finalized) {
    throw new AppError(500, "INTERNAL_ERROR", "Schedule submission failed.");
  }
  const { status, memberCount, submittedCount, finalized: result } = finalized;

  // Socket events are notifications; clients refetch the REST result for
  // the authoritative snapshot.
  broadcastToRoom(input.roomCode, "room:user_updated", {
    userId: input.userId,
    userName: input.userName,
    isSubmitted: true,
    memberCount,
    submittedCount,
  });
  if (result) {
    broadcastToRoom(input.roomCode, "room:state_change", {
      status,
      resultVersion: result.resultVersion,
      result: result.result,
    });
  }

  return {
    roomCode: input.roomCode,
    status,
    isSubmitted: true,
    submittedCount,
    memberCount,
  };
}

export interface RoomResultResponse {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  memberCount: number;
  submittedCount: number;
  resultVersion: number;
  sharedWindow: SharedWindow | null;
  recommendations: CalculationResult["recommendations"];
}

/**
 * Authoritative room snapshot. Safe to call after reconnecting or missing
 * a socket event; never exposes another user's raw busy hours.
 */
export async function getRoomResult(roomCode: string): Promise<RoomResultResponse> {
  const room = await Room.findOne({ roomCode });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found.");
  const { memberCount, submittedCount } = await countMembers(room._id);
  const finishedResult = room.status === "FINISHED" ? room.result : null;
  return {
    roomId: String(room._id),
    roomCode: room.roomCode,
    status: room.status,
    memberCount,
    submittedCount,
    resultVersion: room.resultVersion,
    sharedWindow: finishedResult?.sharedWindow ?? null,
    recommendations: finishedResult?.recommendations ?? [],
  };
}
