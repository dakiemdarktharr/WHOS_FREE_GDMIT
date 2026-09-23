# Who's free, gdmit — API routes ground truth

These route definitions are authoritative for Worker 1 and Worker 2. Do not add an alternate versioned path without updating [ARCHITECTURE.md](./ARCHITECTURE.md).

Base URL: the Express server's `/api` prefix. The Next.js web app may proxy these paths to the server during local development and on deployment.

## Shared conventions

- Content type: `application/json`.
- Invalid input: `400` with `{ "error": { "code": "VALIDATION_ERROR", "message": string, "fields"?: object } }`.
- Missing room: `404` with `{ "error": { "code": "ROOM_NOT_FOUND", "message": "Room not found." } }`.
- Server failure: `500` with `{ "error": { "code": "INTERNAL_ERROR", "message": string } }`.
- `userId` is an anonymous stable browser identifier. It is not an authentication credential.
- `timezone` values must be valid IANA identifiers such as `Asia/Saigon` or `America/Los_Angeles`.

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
  "roomCode": "48307",
  "status": "COLLECTING",
  "memberCount": 2,
  "submittedCount": 0
}
```

## `POST /api/schedules/submit`

Atomically replaces the caller's schedule for a room. The caller's `busySlots` may include days with empty `hours` arrays to explicitly mark fully-free days.

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

If all members have submitted, the server computes the result and emits `room:state_change` with `FINISHED`. If the room is not ready, it remains `COLLECTING` or `COMPUTING` according to the current operation.

## `GET /api/rooms/:roomCode/result`

Returns current room state and ranked slots. It is safe to call after reconnecting or missing a socket event.

Response `200` while collecting:

```json
{
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
  ]
}
```

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

The client must refetch `GET /api/rooms/:roomCode/result` after receiving `room:state_change`; the socket payload is a low-latency hint and the REST response is the authoritative snapshot.
