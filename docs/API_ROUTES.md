# Who's free, gdmit — API routes ground truth

These route definitions are authoritative for Worker 1 and Worker 2. Do not add an alternate versioned path without updating [ARCHITECTURE.md](./ARCHITECTURE.md).

Base URL: the Express server's `/api` prefix. The Next.js web app may proxy these paths to the server during local development and on deployment.

## Shared conventions

- Content type: `application/json`.
- Invalid input: `400` with `{ "error": { "code": "VALIDATION_ERROR", "message": string, "fields"?: object } }`.
- Missing room: `404` with `{ "error": { "code": "ROOM_NOT_FOUND", "message": "Room not found." } }`.
- Join on a finished room: `409` with `{ "error": { "code": "ROOM_FINISHED", "message": string } }`.
- Unknown route: `404` with `{ "error": { "code": "NOT_FOUND", "message": string } }`.
- Server failure: `500` with `{ "error": { "code": "INTERNAL_ERROR", "message": string } }`.
- `userId` is an anonymous stable browser identifier. It is not an authentication credential.
- `timezone` values must be valid IANA identifiers such as `Asia/Saigon` or `America/Los_Angeles`.
- The create, join, and result responses include `roomId` (the room's MongoDB ObjectId as a string) so the browser can submit a schedule against the durable room record.

## `GET /health`

Liveness and connectivity probe; no MongoDB queries are performed.

Response `200`:

```json
{ "status": "ok", "uptime": 123, "database": "connected" }
```

`database` is `"connected" | "connecting" | "disconnected"`.

## `POST /api/rooms/create`

Creates a room and registers the creator as its first participant.

Request:

```json
{
  "userId": "browser-generated-uuid",
  "userName": "Sam",
  "creatorTimezone": "Asia/Saigon"
}
```

Response `201`:

```json
{
  "room": {
    "roomId": "66f0d31f37fa2b2f1d012345",
    "roomCode": "48307",
    "creatorTimezone": "Asia/Saigon",
    "status": "COLLECTING",
    "createdAt": "2026-09-24T00:00:00.000Z"
  },
  "member": { "userId": "browser-generated-uuid", "userName": "Sam", "isSubmitted": false }
}
```

## `POST /api/rooms/join`

Validates a room code and joins or refreshes a member.

Request:

```json
{
  "roomCode": "48307",
  "userId": "browser-generated-uuid",
  "userName": "Alex",
  "userTimezone": "America/Los_Angeles"
}
```

Response `200`:

```json
{
  "roomId": "66f0d31f37fa2b2f1d012345",
  "roomCode": "48307",
  "status": "COLLECTING",
  "memberCount": 2,
  "submittedCount": 0
}
```

## `POST /api/schedules/submit`

Atomically replaces the caller's schedule for a room. The caller's `busySlots` may include days with empty `hours` arrays to explicitly mark fully-free days. `roomId` is optional; when present it must be the MongoDB ObjectId of the room identified by `roomCode`. Duplicate dates are merged (union of hours); duplicate hours are deduplicated and sorted before persistence.

Request:

```json
{
  "roomCode": "48307",
  "roomId": "66f0d31f37fa2b2f1d012345",
  "userId": "browser-generated-uuid",
  "userName": "Alex",
  "userTimezone": "America/Los_Angeles",
  "busySlots": [
    { "date": "2026-09-24", "hours": [9, 10, 11] },
    { "date": "2026-09-25", "hours": [] }
  ]
}
```

Response `202`:

```json
{
  "roomCode": "48307",
  "status": "COMPUTING",
  "isSubmitted": true,
  "submittedCount": 2,
  "memberCount": 3
}
```

If all members have submitted, the server computes the result and emits `room:state_change` with `FINISHED`. If the room is not ready, it remains `COLLECTING` or `COMPUTING` according to the current operation. Computation is synchronous inside the request: the response `status` is the post-computation state (`FINISHED` when every member has submitted, `COLLECTING` otherwise), and `COMPUTING` is the transient state broadcast between the two.

## `GET /api/rooms/:roomCode/result`

Returns current room state and ranked slots. It is safe to call after reconnecting or missing a socket event.

Response `200` while collecting:

```json
{
  "roomId": "66f0d31f37fa2b2f1d012345",
  "roomCode": "48307",
  "status": "COLLECTING",
  "memberCount": 3,
  "submittedCount": 2,
  "resultVersion": 0,
  "sharedWindow": null,
  "recommendations": []
}
```

Response `200` when finished:

```json
{
  "roomId": "66f0d31f37fa2b2f1d012345",
  "roomCode": "48307",
  "status": "FINISHED",
  "memberCount": 3,
  "submittedCount": 3,
  "resultVersion": 1,
  "sharedWindow": { "start": "2026-09-24", "end": "2026-09-26" },
  "recommendations": [
    {
      "startsAtUtc": "2026-09-25T15:00:00.000Z",
      "busyCount": 0,
      "availableCount": 3
    }
  ],
  "explanation": null
}
```

Recommendation contract:

- `recommendations` contains at most 12 slots (the top result window size), ranked by ascending `busyCount`, then by ascending `startsAtUtc`.
- `sharedWindow` is `null` when the submitted date windows do not intersect.
- `explanation` is `null` normally; it carries a short message when the result needs context, e.g. an empty intersection or a least-conflict fallback because no slot works for every member.
- `startsAtUtc` is a UTC instant; the UI converts it into the viewer's local timezone for display.

## Socket.io namespace and events

Connect to the server root and join the Socket.io room named `room:{roomCode}`.

### Client → server: `room:join`

```ts
socket.emit("room:join", {
  roomCode: "48307",
  userId: "browser-generated-uuid",
  userName: "Alex"
});
```

### Server → room: `room:user_updated`

```ts
{
  userId: "browser-generated-uuid",
  userName: "Alex",
  isSubmitted: true,
  memberCount: 3,
  submittedCount: 2
}
```

### Server → room: `room:state_change`

```ts
{
  "status": "FINISHED",
  "resultVersion": 1,
  "result": {
    "sharedWindow": { "start": "2026-09-24", "end": "2026-09-26" },
    "recommendations": []
  }
}
```

### Server → caller: `room:joined`

Sent only to the joining socket after a valid `room:join` — the current member state for that caller. Existing members may reconnect to a `FINISHED` room to observe the result; new members must use the REST join endpoint first.

```ts
{
  "roomCode": "48307",
  "status": "FINISHED",
  "memberCount": 3,
  "submittedCount": 3,
  "resultVersion": 1
}
```

### Server → caller: `room:join_error`

Sent only to the joining socket when `room:join` is rejected (invalid payload, unknown room, or the `userId` has no membership record).

```ts
{ "code": "VALIDATION_ERROR" | "ROOM_NOT_FOUND" | "NOT_A_MEMBER", "message": string }
```

The client must refetch `GET /api/rooms/:roomCode/result` after receiving `room:state_change`; the socket payload is a low-latency hint and the REST response is the authoritative snapshot.
