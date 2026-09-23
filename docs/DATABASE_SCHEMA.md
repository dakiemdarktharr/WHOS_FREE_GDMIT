# Who's free, gdmit — MongoDB schema ground truth

MongoDB is the durable source of truth. Mongoose models live in `apps/server/src/models/` and must match these fields and indexes.

## `rooms` collection

```ts
const RecommendationSchema = new Schema({
  startsAtUtc: { type: String, required: true },
  busyCount: { type: Number, required: true, min: 0 },
  availableCount: { type: Number, required: true, min: 0 }
}, { _id: false });

const SharedWindowSchema = new Schema({
  start: { type: String, required: true },
  end: { type: String, required: true }
}, { _id: false });

const RoomResultSchema = new Schema({
  sharedWindow: { type: SharedWindowSchema, default: null },
  recommendations: { type: [RecommendationSchema], default: [] },
  explanation: { type: String, default: null }
}, { _id: false });

const RoomSchema = new Schema({
  roomCode: { type: String, required: true, unique: true, match: /^\\d{5}$/ },
  creatorTimezone: { type: String, required: true },
  status: {
    type: String,
    enum: ["COLLECTING", "COMPUTING", "FINISHED"],
    default: "COLLECTING",
    required: true
  },
  resultVersion: { type: Number, default: 0, required: true },
  result: { type: RoomResultSchema, default: null },
  createdAt: { type: Date, default: Date.now, required: true }
});
```

The `unique: true` declaration on `roomCode` creates the unique index directly; the explicit `RoomSchema.index({ roomCode: 1 }, { unique: true })` call was removed because Mongoose would otherwise register the same index twice and warn on every connection.

The `roomCode` uniqueness constraint is the final collision guard after cryptographic generation. The server must retry a duplicate-key insert rather than return a duplicate code.

`resultVersion` increments once per completed computation (including recomputations after a resubmit). `result` holds the latest `CalculationResult` and stays `null` until the first `FINISHED` transition, so `GET /api/rooms/:roomCode/result` can answer authoritatively after a reconnect without re-running the calculator.

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

A schedule document doubles as the room membership record: joining a room (or creating one) upserts a schedule with `isSubmitted: false` and empty `busySlots`. `memberCount` and `submittedCount` are therefore counts over this collection, and a schedule is addressable only by `(roomId, userId)`.

## State transitions

```text
COLLECTING ── all joined schedules submitted ──▶ COMPUTING
COMPUTING  ── calculator succeeds              ──▶ FINISHED
COMPUTING  ── member resubmits                 ──▶ COMPUTING
FINISHED   ── member resubmits                 ──▶ COMPUTING
FINISHED   ── new member joins                 ──▶ COLLECTING
```

The room status update and the schedule upsert must happen in a transaction when MongoDB is running as a replica set, including MongoDB Atlas. If a transaction is unavailable in local development, the service must make the schedule write idempotent and recompute from a fresh read before broadcasting `FINISHED`.

When a new member joins a finished room, clear the stored result while keeping existing submissions and `resultVersion`. A subsequent completed calculation increments `resultVersion`.

## Privacy and query boundaries

- `GET /api/rooms/:roomCode/result` returns the participant roster, aggregate counts, recommendations, and names of members free during recommended time spans, never another user's raw busy hours.
- A schedule is addressable only by `(roomId, userId)` inside a validated room membership flow.
- Do not store MongoDB credentials, Ably keys, or deployment tokens in this repository.
