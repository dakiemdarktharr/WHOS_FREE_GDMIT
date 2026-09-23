# Who's free, gdmit — Phase 1 architecture ground truth

Status: Phase 1 scaffold specification  
Owner: Luna, Lead Autonomous Software Architect  
Ground truth: this file, [API_ROUTES.md](./API_ROUTES.md), and [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

## Product contract

Who's free, gdmit is a real-time room where a group marks busy hours and receives the lowest-conflict meeting slots. A creator starts a room with **Making a legit plan..**. The server issues a cryptographically generated five-digit numeric `roomCode`. Other people enter that code in **Plan ID num** and join the same live room.

All entered dates and hours are interpreted in the submitting user's IANA timezone. Schedules are persisted as local calendar intent (`date` plus `hours`) and are normalized to UTC instants by the calculator when comparing members from different timezones.

## Workspace layout

```text
/
├── apps/
│   ├── web/                         # Next.js 14 App Router, Tailwind, Framer Motion
│   │   ├── app/
│   │   │   ├── page.tsx             # Landing / create / join
│   │   │   └── room/[roomCode]/     # Live calendar room
│   │   ├── components/
│   │   └── lib/socket.ts            # Socket.io client adapter
│   └── server/                      # Express + TypeScript API and Socket.io
│       └── src/
│           ├── models/              # Mongoose Room and Schedule models
│           ├── routes/              # REST route handlers
│           ├── services/            # ScheduleCalculator and room services
│           └── socket/              # Socket.io event handlers
├── docs/
│   ├── ARCHITECTURE.md              # This file: system and behavior contract
│   ├── API_ROUTES.md                # HTTP request/response contract
│   └── DATABASE_SCHEMA.md           # MongoDB/Mongoose contract
├── package.json                     # Workspace scripts and package manager entry
└── README.md
```

The current repository contains the earlier single-app scaffold under `src/`. Worker 1 and Worker 2 must treat these `/docs` files as the migration target and must not introduce a competing route or model definition.

## Data models

### Room

```ts
type RoomStatus = "COLLECTING" | "COMPUTING" | "FINISHED";

type Room = {
  _id: ObjectId;
  roomCode: string;        // exactly 5 numeric characters, unique
  creatorTimezone: string; // IANA timezone
  status: RoomStatus;
  createdAt: Date;
};
```

The database enforces a unique index on `roomCode`. The API must retry code generation on a duplicate-key collision.

### Schedule

```ts
type BusyDay = {
  date: string;     // YYYY-MM-DD in userTimezone
  hours: number[];  // unique integers in the inclusive range 0..23
};

type Schedule = {
  _id: ObjectId;
  roomId: ObjectId;
  userId: string;       // stable anonymous participant id for the room
  userName: string;
  userTimezone: string; // IANA timezone captured by the browser
  busySlots: BusyDay[];
  isSubmitted: boolean;
  updatedAt: Date;
};
```

One schedule document represents one user's complete room submission. Submitting again replaces that user's `busySlots` atomically.

## REST resources

The canonical paths and payloads are defined in [API_ROUTES.md](./API_ROUTES.md):

- `POST /api/rooms/create` creates a room and returns the five-digit `roomCode`.
- `POST /api/rooms/join` validates a code and registers/refreshes a room participant.
- `POST /api/schedules/submit` replaces the caller's schedule and triggers recomputation when appropriate.
- `GET /api/rooms/:roomCode/result` returns room state and ranked low-conflict slots.

The web app may proxy these paths through Next.js rewrites so the browser uses one origin. The Express server remains the owner of REST behavior and Socket.io state.

## Socket.io event matrix

| Event | Direction | Payload | Behavior |
|---|---|---|---|
| `room:join` | client → server | `{ roomCode, userId, userName }` | Validate membership, join Socket.io room, emit current member state to caller. |
| `room:user_updated` | server → room | `{ userId, userName, isSubmitted, memberCount, submittedCount }` | Broadcast presence/submission progress without exposing another user's busy hours. |
| `room:state_change` | server → room | `{ status, resultVersion, result? }` | Broadcast `COMPUTING` and `FINISHED` transitions plus the latest ranked result. |

Socket.io is the live transport for room coordination. MongoDB remains the source of truth; socket events are notifications and must be safe to replay after a reconnect.

## Plan lifecycle

1. Creator posts timezone and receives a room code.
2. Members join with the code and a stable anonymous `userId`.
3. Each member opens the current local month, double-clicks days, and toggles 24 hourly squares between free and busy.
4. `ESC` closes the inspector without losing the current draft; explicit submit persists the complete schedule.
5. The room remains `COLLECTING` until all currently joined members submit. The server changes status to `COMPUTING`, calculates results, then changes status to `FINISHED` and broadcasts the result.
6. A member may resubmit. That returns the room to `COMPUTING` and increments `resultVersion`.

## Overlapping date boundary algorithm

For every submitted member, derive their inclusive local boundary from the earliest and latest `busySlots[].date`. A saved day with an empty `hours` array is valid and means fully free for that date. The room's candidate date interval is:

```text
candidateStart = max(memberWindowStart for every submitted member)
candidateEnd   = min(memberWindowEnd   for every submitted member)
```

If `candidateStart > candidateEnd`, the room has no shared date window and the result is an empty list with an explanatory status. Otherwise, enumerate each local calendar day in the intersection, convert each member's 0..23 local hours to UTC instants using that member's IANA timezone, and evaluate one-hour UTC slots.

For each candidate UTC hour:

```text
busyCount      = number of members whose normalized busy set contains the slot
availableCount = submittedMemberCount - busyCount
```

Sort ascending by `busyCount`, then ascending by UTC instant. Return the top result window size defined in the API contract. The UI converts each returned UTC instant into the viewer's local timezone for display. Never calculate by comparing raw local hour integers across timezones.

## Non-negotiable invariants

- Numeric room codes are exactly five characters and contain only `0..9`.
- `hours` contains no duplicates and no value outside `0..23`.
- All user-provided timezones must be valid IANA timezone identifiers.
- REST writes are validated with Zod before persistence.
- MongoDB is authoritative; Socket.io never stores business state.
- `/docs` is the structural ground truth. Any route, event, model, or directory change updates the relevant `/docs` file in the same change.
