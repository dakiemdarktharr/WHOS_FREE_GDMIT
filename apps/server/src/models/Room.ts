import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import type { RoomStatus } from "../lib/types.js";

const RecommendationSchema = new Schema(
  {
    startsAtUtc: { type: String, required: true },
    busyCount: { type: Number, required: true, min: 0 },
    availableCount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const SharedWindowSchema = new Schema(
  {
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  { _id: false },
);

const RoomResultSchema = new Schema(
  {
    sharedWindow: { type: SharedWindowSchema, default: null },
    recommendations: { type: [RecommendationSchema], default: [] },
    explanation: { type: String, default: null },
  },
  { _id: false },
);

const RoomSchema = new Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    match: /^\d{5}$/,
  },
  creatorTimezone: { type: String, required: true },
  status: {
    type: String,
    enum: ["COLLECTING", "COMPUTING", "FINISHED"] satisfies RoomStatus[],
    default: "COLLECTING",
    required: true,
  },
  // Increments once per completed computation; a resubmit recomputes.
  resultVersion: { type: Number, default: 0, required: true },
  // Latest computed result, null until the first FINISHED transition.
  result: { type: RoomResultSchema, default: null },
  createdAt: { type: Date, default: Date.now, required: true },
});

// The unique index on `roomCode` is declared by `unique: true` on the field
// above; declaring it again via RoomSchema.index() would create a duplicate
// index definition that Mongoose warns about on every connection.

export type RoomDocument = HydratedDocument<InferSchemaType<typeof RoomSchema>>;

export const Room = model("Room", RoomSchema);
