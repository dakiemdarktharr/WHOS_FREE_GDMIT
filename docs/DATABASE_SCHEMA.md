# Who's free, gdmit — MongoDB schema ground truth

MongoDB is the durable source of truth. Mongoose models live in `apps/server/src/models/` and must match these fields and indexes.

## `rooms` collection

```ts
const RoomSchema = new Schema({
  roomCode: { type: String, required: true, unique: true, match: /^\\d{5}$/ },
  creatorTimezone: { type: String, required: true },
  status: {
    type: String,
    enum: ["COLLECTING", "COMPUTING", "FINISHED"],
    default: "COLLECTING",
    required: true
  },
  createdAt: { type: Date, default: Date.now, required: true }
});

RoomSchema.index({ roomCode: 1 }, { unique: true });
```

The `roomCode` uniqueness constraint is the final collision guard after cryptographic generation. The server must retry a duplicate-key insert rather than return a duplicate code.

## `schedules` collection

```ts
const BusyDaySchema = new Schema({
  date: { type: String, required: true, match: /^\\d{4}-\\d{2}-\\d{2}$/ },
  hours: [{ type: Number, min: 0, max: 23 }]
}, { _id: false });

const ScheduleSchema = new Schema({
  roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true, trim: true, maxlength: 40 },
  userTimezone: { type: String, required: true },
  busySlots: { type: [BusyDaySchema], required: true, default: [] },
  isSubmitted: { type: Boolean, required: true, default: false },
  updatedAt: { type: Date, default: Date.now, required: true }
});

ScheduleSchema.index({ roomId: 1, userId: 1 }, { unique: true });
ScheduleSchema.index({ roomId: 1, isSubmitted: 1 });
```

`busySlots` is a complete replacement on submission. The service validates dates, deduplicates hours, sorts hours, and rejects any value outside the contract before calling `findOneAndUpdate` with `{ upsert: true }`.

## State transitions

```text
COLLECTING ── all joined schedules submitted ──▶ COMPUTING
COMPUTING  ── calculator succeeds              ──▶ FINISHED
COMPUTING  ── member resubmits                 ──▶ COMPUTING
FINISHED   ── member resubmits                 ──▶ COMPUTING
```

The room status update and the schedule upsert must happen in a transaction when MongoDB is running as a replica set, including MongoDB Atlas. If a transaction is unavailable in local development, the service must make the schedule write idempotent and recompute from a fresh read before broadcasting `FINISHED`.

## Privacy and query boundaries

- `GET /api/rooms/:roomCode/result` returns aggregate counts and recommendations, never another user's raw busy hours.
- A schedule is addressable only by `(roomId, userId)` inside a validated room membership flow.
- Do not store MongoDB credentials, Ably keys, or deployment tokens in this repository.
