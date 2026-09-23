export type RoomContext = {
  userId: string;
  userName: string;
  timezone: string;
  roomId: string;
};

function roomSessionKey(roomCode: string): string {
  return `whos-free-room:${roomCode}`;
}

export function readRoomContext(roomCode: string): RoomContext | null {
  try {
    const raw = window.sessionStorage.getItem(roomSessionKey(roomCode));
    if (!raw) return null;
    const context = JSON.parse(raw) as Partial<RoomContext>;
    if (!context.userId || !context.userName || !context.timezone) return null;
    return { ...context, roomId: context.roomId || "" } as RoomContext;
  } catch {
    return null;
  }
}

export function saveRoomContext(roomCode: string, context: RoomContext): void {
  window.sessionStorage.setItem(roomSessionKey(roomCode), JSON.stringify(context));
}

export function newRoomContext(userName: string): RoomContext {
  return {
    userId: crypto.randomUUID(),
    userName,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    roomId: "",
  };
}

export function contextForJoin(roomCode: string, userName: string): RoomContext {
  const existing = readRoomContext(roomCode);
  if (existing?.userName === userName) return existing;
  if (existing) return newRoomContext(userName);

  // A person who joined before tab-scoped identities were introduced can
  // reclaim that membership by entering the same name. Never load this
  // shared legacy identity automatically in another tab.
  try {
    const legacy = JSON.parse(window.localStorage.getItem(roomSessionKey(roomCode)) || "{}") as Partial<RoomContext>;
    if (legacy.userId && legacy.userName === userName) {
      return { ...newRoomContext(userName), userId: legacy.userId };
    }
  } catch {
    // A damaged legacy value is ignored; the participant can join afresh.
  }
  return newRoomContext(userName);
}
