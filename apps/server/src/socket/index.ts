import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { corsOrigins } from "../config/env.js";
import { Room } from "../models/Room.js";
import { Schedule } from "../models/Schedule.js";
import { roomJoinSocketSchema } from "../lib/validation.js";

let io: Server | null = null;

/** The Socket.io room name for a room code, per docs/ARCHITECTURE.md. */
export function roomChannel(roomCode: string): string {
  return `room:${roomCode}`;
}

/**
 * Attach Socket.io to the HTTP server. Socket.io is a notification transport
 * only: MongoDB stays authoritative and every event is safe to replay after
 * a reconnect via `GET /api/rooms/:roomCode/result`.
 */
export function initSocketServer(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: corsOrigins(), methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    socket.on("room:join", async (payload: unknown) => {
      const parsed = roomJoinSocketSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("room:join_error", {
          code: "VALIDATION_ERROR",
          message: "Invalid room:join payload.",
        });
        return;
      }
      const { roomCode, userId, userName } = parsed.data;

      const room = await Room.findOne({ roomCode });
      if (!room) {
        socket.emit("room:join_error", { code: "ROOM_NOT_FOUND", message: "Room not found." });
        return;
      }

      const membership = await Schedule.findOne({ roomId: room._id, userId });
      if (!membership) {
        socket.emit("room:join_error", {
          code: "NOT_A_MEMBER",
          message: "Join the room over REST before opening a live connection.",
        });
        return;
      }

      // Joining or refreshing keeps the stored name current.
      if (membership.userName !== userName) {
        membership.userName = userName;
        await membership.save();
      }

      const memberCount = await Schedule.countDocuments({ roomId: room._id });
      const submittedCount = await Schedule.countDocuments({
        roomId: room._id,
        isSubmitted: true,
      });

      await socket.join(roomChannel(roomCode));
      socket.emit("room:joined", {
        roomCode,
        status: room.status,
        memberCount,
        submittedCount,
        resultVersion: room.resultVersion,
      });
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

/** Broadcast to every socket joined to a room; no-op before initialization. */
export function broadcastToRoom(roomCode: string, event: string, payload: unknown): void {
  io?.to(roomChannel(roomCode)).emit(event, payload);
}

/** Close the socket server; part of graceful shutdown. */
export async function closeSocketServer(): Promise<void> {
  if (!io) return;
  const current = io;
  io = null;
  await new Promise<void>((resolve) => current.close(() => resolve()));
}
