import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

const BusyDaySchema = new Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    hours: [{ type: Number, min: 0, max: 23 }],
  },
  { _id: false },
);

/**
 * One schedule document represents one user's complete room submission and
 * doubles as the room membership record: joining a room upserts a schedule
 * with `isSubmitted: false`. Submitting atomically replaces `busySlots`.
 */
const ScheduleSchema = new Schema({
  roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true, trim: true, maxlength: 40 },
  userTimezone: { type: String, required: true },
  busySlots: { type: [BusyDaySchema], required: true, default: [] },
  isSubmitted: { type: Boolean, required: true, default: false },
  updatedAt: { type: Date, default: Date.now, required: true },
});

ScheduleSchema.index({ roomId: 1, userId: 1 }, { unique: true });
ScheduleSchema.index({ roomId: 1, isSubmitted: 1 });

export type ScheduleDocument = HydratedDocument<InferSchemaType<typeof ScheduleSchema>>;

export const Schedule = model("Schedule", ScheduleSchema);
