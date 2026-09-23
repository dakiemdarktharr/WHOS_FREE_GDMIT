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
│           ├── routes/              # REST route handlers (rooms, schedules, health)
│           ├── services/            # ScheduleCalculator and room services
│           ├── socket/              # Socket.io event handlers and broadcast helpers
│           ├── middleware/          # Zod request validation and centralized errors
│           ├── config/              # Environment validation (Zod) and CORS origins
│           ├── db/                  # MongoDB connection handling
│           ├── lib/                 # Room codes, timezone math, shared types, Zod schemas
│           ├── tests/               # Unit tests (calculator, validation, codes, time)
│           ├── app.ts               # Express app assembly
│           └── index.ts             # Bootstrap: config → db → http → socket → listen
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
  resultVersion: number;   // increments once per completed computation
  result: {                // latest CalculationResult; null until first FINISHED
    sharedWindow: SharedWindow | null;
    recommendations: Recommendation[];
    explanation: string | null;
  } | null;
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

For Vercel deployment, deploy `apps/server` as a separate Express project. Its function establishes the MongoDB connection before handling `/api` requests; `/health` reports connection state without querying MongoDB. Set the web project's `API_BASE_URL` to the public origin of that Express project. A Vercel function cannot guarantee that every Socket.io connection and event reaches the same running instance, so the browser also refreshes the authoritative result endpoint every five seconds. A persistent Node host retains the Socket.io fast path.

## Socket.io event matrix

| Event | Direction | Payload | Behavior |
|---|---|---|---|
| `room:join` | client → server | `{ roomCode, userId, userName }` | Validate membership, join Socket.io room, emit current member state to caller. |
| `room:user_updated` | server → room | `{ userId, userName, isSubmitted, memberCount, submittedCount }` | Broadcast presence/submission progress without exposing another user's busy hours. |
| `room:state_change` | server → room | `{ status, resultVersion, result? }` | Broadcast `COMPUTING` and `FINISHED` transitions plus the latest ranked result. |
| `room:joined` | server → caller | `{ roomCode, status, memberCount, submittedCount, resultVersion }` | Current state for the joining socket after a valid `room:join`. Members may reconnect to a `FINISHED` room; new members must join over REST first. |
| `room:join_error` | server → caller | `{ code, message }` | Rejection of `room:join`: `VALIDATION_ERROR`, `ROOM_NOT_FOUND`, or `NOT_A_MEMBER`. |

Socket.io is the live transport for room coordination. MongoDB remains the source of truth; socket events are notifications and must be safe to replay after a reconnect.

## Plan lifecycle

1. Creator posts timezone and receives a room code.
2. Members join with the code and a stable anonymous `userId` scoped to their browser tab and room. Choosing a different name in the same tab creates a new participant; another tab never silently reuses the previous tab's identity.
3. Each member opens the current local month, double-clicks days, and toggles 24 hourly squares between free and busy.
4. `ESC` closes the inspector without losing the current draft; explicit submit persists the complete schedule.
5. The room remains `COLLECTING` until all currently joined members submit. The server changes status to `COMPUTING`, calculates results, then changes status to `FINISHED` and broadcasts the result. A new participant may join a finished room: this clears the previous result and returns the room to `COLLECTING` until the new participant submits.
6. A member may resubmit. That returns the room to `COMPUTING` and increments `resultVersion`.
7. Computation runs synchronously inside the submit request; `COMPUTING` is the transient state broadcast between schedule persistence and the `FINISHED` transition. The room document stores `resultVersion` and the latest `result`, so `GET /api/rooms/:roomCode/result` is authoritative after a reconnect without re-running the calculator.

## Health endpoint

`GET /health` reports process uptime and the MongoDB connection state. It is excluded from the `/api` surface and performs no database queries.

## Overlapping date boundary algorithm

For every submitted member, derive their inclusive local boundary from the earliest and latest `busySlots[].date`. A saved day with an empty `hours` array is valid and means fully free for that date. The room's candidate date interval is:

```text
candidateStart = max(memberWindowStart for every submitted member)
candidateEnd   = min(memberWindowEnd   for every submitted member)
```

If `candidateStart > candidateEnd`, the room has no shared date window and the result is an empty list with an explanatory status. Otherwise, enumerate each local calendar day in the intersection, convert each member's 0..23 local hours to UTC instants using that member's IANA timezone, and evaluate one-hour UTC slots.
On daylight saving transitions, a nonexistent local hour contributes no UTC slot and a repeated local hour contributes both UTC slots. Marking that repeated hour busy marks both occurrences busy.

For each candidate UTC hour:

```text
busyCount      = number of members whose normalized busy set contains the slot
availableCount = submittedMemberCount - busyCount
```

Sort ascending by `busyCount`, then ascending by UTC instant. Return the top 12 slots (the top result window size defined in the API contract). The result endpoint projects adjacent recommended one-hour slots with the same available participants into explicit time spans and names every free participant for each span. This projection never exposes raw busy-hour submissions. If no slot is free for every member, the top slots are the minimum-conflict ones and the result carries an explanation. The UI converts each returned UTC instant into the viewer's local timezone for display. Never calculate by comparing raw local hour integers across timezones.

## Current frontend presentation (2026-09-24)

The active frontend remains in `src/` while the workspace migration is pending. `src/app/layout.tsx` loads the structural styles in `globals.css`, followed by the holographic presentation layer in `chrome.css`. It mounts `src/components/ChromeWorld.tsx`, which dynamically imports `src/lib/chrome-scene.ts` on the client. Three.js renders one viewport-fixed wave surface shared by landing, calendar, and hour editor. Seven supplied reference textures in `public/textures/waves/` flow across the same displacement field: chrome, holographic halftone, and wire-grid designs change spatially through waves, not through full-screen slideshow transitions. Scrolling moves page content, not the background. `public/textures/liquid-chrome.png` remains the immediate static fallback if WebGL or assets fail.

Locally hosted Audiowide is the display face; Rajdhani is the interface face. Font binaries and their OFL licenses live in `public/fonts/`, loaded through `next/font/local`. The landing title is the actual beveled, solid-mesh chrome model `public/models/whos-free-solid-chrome.glb`, reading exactly `WHO'S FREE GODAMITTTT!`. It fits approximately 80% of viewport width (with a height safety limit), follows the mouse relative to the complete title's projected center with fast damped rotation, and scrolls out with the hero. It is loaded only when the landing hero exists. `Landing.tsx` keeps an accessible semantic/CSS fallback heading and the scroll-triggered form reveal. Demo/studio controls are not shipped. Visible copy is deliberately brief; form labels, timezones, errors, and accessible hour labels remain explicit.

The renderer caps pixel density, targets 30fps on coarse-pointer devices, suspends drawing in hidden tabs, and disposes textures, geometry, materials, listeners, and animation frames on unmount. A visible pause control freezes decorative motion. Reduced-motion preferences render a static scene and disable pointer tilt. Context loss returns to the static background and CSS heading. Rendering never captures scroll or blocks the room controls. The integration boundary is recorded in `docs/visual-contract.json`.

`PlanRoomClient.tsx` owns visual feedback only: selecting an hour plays a short snap/padlock animation and retains `aria-pressed`. Deselecting unlocks it. Calendar days with at least one busy hour show a diagonal purple enchantment overlay at opacity `0.5`; the original saved-day background and foreground labels remain intact. Saved empty days have no enchantment. Escape preserves the existing local draft behavior. Reduced-motion preferences disable entrance, tilt, background, lock, and glint animations while preserving all controls and state indicators. The horizontal 24-hour strip scrolls inside its panel on narrow screens.

These presentation changes do not change any API, model, timezone, or scheduling contract.

## Non-negotiable invariants

- Numeric room codes are exactly five characters and contain only `0..9`.
- `hours` contains no duplicates and no value outside `0..23`.
- All user-provided timezones must be valid IANA timezone identifiers.
- REST writes are validated with Zod before persistence.
- MongoDB is authoritative; Socket.io never stores business state.
- The room code is a deliberately short human-friendly identifier, not a secret: the REST surface is per-IP rate limited (120/min general, 30/min for room mutations) to raise the cost of code enumeration, and `userId` is an anonymous label and never an authentication credential. Joining a finished room is allowed so a late participant can contribute; schedule submission still requires membership.
- `/docs` is the structural ground truth. Any route, event, model, or directory change updates the relevant `/docs` file in the same change.
