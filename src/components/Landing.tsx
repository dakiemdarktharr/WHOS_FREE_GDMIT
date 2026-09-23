"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

const participantKey = "whos-free-participant";

type BrowserContext = { userId: string; userName: string; timezone: string };

function browserContext(userName: string): BrowserContext {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let userId = "";
  try {
    const stored = JSON.parse(window.localStorage.getItem(participantKey) || "{}") as { userId?: string };
    userId = stored.userId || "";
  } catch {
    userId = "";
  }
  if (!userId) userId = crypto.randomUUID();
  window.localStorage.setItem(participantKey, JSON.stringify({ userId, userName, timezone }));
  return { userId, userName, timezone };
}

async function readBody(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "The room could not be reached. Try again.");
  return body;
}

export function Landing() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timezone, setTimezone] = useState("detecting your timezone…");

  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!displayName.trim()) return setError("Add your name so the room knows who you are.");
    setBusy(true);
    try {
      const context = browserContext(displayName.trim());
      const body = await readBody(await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: context.userId, userName: context.userName, creatorTimezone: context.timezone }),
      }));
      const room = body.room;
      const roomCode = room?.roomCode as string | undefined;
      if (!roomCode || !/^\d{5}$/.test(roomCode)) throw new Error("The server returned an invalid Plan ID.");
      window.localStorage.setItem(`whos-free-room:${roomCode}`, JSON.stringify({ ...context, roomId: room._id ?? room.id ?? body.roomId ?? "" }));
      router.push(`/room/${roomCode}` as Route);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a plan.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    setError("");
    const roomCode = planCode.trim();
    if (!displayName.trim()) return setError("Add your name so the room knows who you are.");
    if (!/^\d{5}$/.test(roomCode)) return setError("A Plan ID has exactly five numbers.");
    setBusy(true);
    try {
      const context = browserContext(displayName.trim());
      const body = await readBody(await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, userId: context.userId, userName: context.userName, userTimezone: context.timezone }),
      })) as { roomId?: string };
      window.localStorage.setItem(`whos-free-room:${roomCode}`, JSON.stringify({ ...context, roomId: body.roomId || "" }));
      router.push(`/room/${roomCode}` as Route);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join that plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing-shell">
      <div className="memphis-dot dot-one" aria-hidden="true" /><div className="memphis-dot dot-two" aria-hidden="true" />
      <section className="landing-copy">
        <div className="brand-chip"><span className="brand-spark" aria-hidden="true">✦</span> group timing, without the group chat spiral</div>
        <h1>Find the golden hour <em>together.</em></h1>
        <p className="lede">Everybody marks when they’re busy. The room finds the quietest overlap, even when your crew is spread across time zones.</p>
        <div className="timezone-pill"><span className="status-light" aria-hidden="true" /> Your clock: {timezone}</div>
      </section>
      <section className="launch-panel cel-panel" aria-label="Create or join a room">
        <div className="panel-tab">start a room</div>
        <form onSubmit={createRoom}>
          <label htmlFor="display-name">Your name</label>
          <input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Sam, snack captain" maxLength={40} autoComplete="name" required />
          <button className="primary-button" disabled={busy}>{busy ? "Warming up the room…" : "Making a legit plan.."}</button>
        </form>
        <div className="join-divider"><span>or join a plan</span></div>
        <form onSubmit={joinRoom} className="join-form">
          <label htmlFor="plan-id">Plan ID num</label>
          <div className="join-row"><input id="plan-id" inputMode="numeric" pattern="[0-9]{5}" value={planCode} onChange={(event) => setPlanCode(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="48307" maxLength={5} autoComplete="one-time-code" required /><button className="secondary-button" disabled={busy}>Join</button></div>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
      <div className="landing-note">No account drama. Your room lives behind a tiny code.</div>
    </main>
  );
}
