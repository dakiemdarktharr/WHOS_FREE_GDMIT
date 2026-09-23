"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { io, type Socket } from "socket.io-client";

type Member = { userId: string; userName: string; isSubmitted: boolean };
type Recommendation = { startsAtUtc: string; busyCount: number; availableCount: number };
type RoomSnapshot = {
  roomCode: string;
  roomId?: string;
  status: "COLLECTING" | "COMPUTING" | "FINISHED";
  memberCount: number;
  submittedCount: number;
  resultVersion?: number;
  recommendations: Recommendation[];
  explanation?: string | null;
};
type RoomContext = { userId: string; userName: string; timezone: string; roomId: string };
type UserUpdate = Member & { memberCount: number; submittedCount: number };

const participantKey = "whos-free-participant";

function draftKey(roomCode: string, userId: string) {
  return `whos-free-draft:${roomCode}:${userId}`;
}

function readDraft(roomCode: string, userId: string): Record<string, number[]> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(draftKey(roomCode, userId)) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([date, hours]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(hours) &&
      hours.every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
    )) as Record<string, number[]>;
  } catch {
    return {};
  }
}

function browserContext(roomCode: string): RoomContext {
  const fallbackTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    const participant = JSON.parse(window.localStorage.getItem(participantKey) || "{}") as Partial<RoomContext>;
    const room = JSON.parse(window.localStorage.getItem(`whos-free-room:${roomCode}`) || "{}") as Partial<RoomContext>;
    return {
      userId: room.userId || participant.userId || crypto.randomUUID(),
      userName: room.userName || participant.userName || "Guest",
      timezone: room.timezone || participant.timezone || fallbackTimezone,
      roomId: room.roomId || "",
    };
  } catch {
    return { userId: crypto.randomUUID(), userName: "Guest", timezone: fallbackTimezone, roomId: "" };
  }
}

function monthDays(timezone: string) {
  const start = DateTime.now().setZone(timezone).startOf("month");
  return Array.from({ length: start.daysInMonth ?? 0 }, (_, index) => start.plus({ days: index }));
}

function formatSlot(iso: string, timezone: string) {
  return DateTime.fromISO(iso).setZone(timezone).toFormat("ccc, LLL d · h a");
}

async function responseBody(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "The room could not be reached. Try again.");
  return body;
}

export function PlanRoomClient({ code }: { code: string }) {
  const [context, setContext] = useState<RoomContext>({ userId: "", userName: "Guest", timezone: "UTC", roomId: "" });
  const contextRef = useRef(context);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [availability, setAvailability] = useState<Record<string, number[]>>({});
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editorHours, setEditorHours] = useState<number[]>([]);
  const [status, setStatus] = useState("Connecting the room…");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const days = useMemo(() => monthDays(context.timezone), [context.timezone]);

  const loadRoom = useCallback(async (nextContext?: RoomContext) => {
    try {
      const result = await responseBody(await fetch(`/api/rooms/${code}/result`, { cache: "no-store" })) as RoomSnapshot & { roomId?: string; members?: Member[] };
      setRoom(result);
      if (Array.isArray(result.members)) setMembers(result.members);
      const activeContext = nextContext || contextRef.current;
      const roomId = activeContext.roomId || result.roomId || "";
      if (roomId && roomId !== activeContext.roomId) {
        const updated = { ...activeContext, roomId };
        contextRef.current = updated;
        setContext(updated);
        window.localStorage.setItem(`whos-free-room:${code}`, JSON.stringify(updated));
      }
      setStatus("Room loaded");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this room.");
      setStatus("Room needs attention");
    }
  }, [code]);

  useEffect(() => {
    const nextContext = browserContext(code);
    contextRef.current = nextContext;
    setContext(nextContext);
    setAvailability(readDraft(code, nextContext.userId));
    setMembers([{ userId: nextContext.userId, userName: nextContext.userName, isSubmitted: false }]);
    void loadRoom(nextContext);
  }, [code, loadRoom]);

  useEffect(() => {
    if (!context.userId) return;
    const socketUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const socket: Socket = io(socketUrl, { transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      setStatus("Live updates connected");
      socket.emit("room:join", { roomCode: code, userId: context.userId, userName: context.userName });
    });
    socket.on("connect_error", () => setStatus("Reconnecting…"));
    socket.on("room:joined", () => void loadRoom());
    socket.on("room:join_error", (failure: { message?: string }) => {
      setError(failure.message || "Could not join live updates.");
      setStatus("Live updates unavailable");
    });
    socket.on("room:user_updated", (update: UserUpdate) => {
      setMembers((current) => {
        const found = current.some((member) => member.userId === update.userId);
        return found ? current.map((member) => member.userId === update.userId ? { ...member, ...update } : member) : [...current, update];
      });
      setRoom((current) => current ? { ...current, memberCount: update.memberCount, submittedCount: update.submittedCount } : current);
    });
    socket.on("room:state_change", () => void loadRoom());
    return () => { socket.disconnect(); };
  }, [code, context.userId, context.userName, loadRoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && editingDate) setEditingDate(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingDate]);

  function openDay(day: DateTime) {
    const date = day.toFormat("yyyy-MM-dd");
    setEditingDate(date);
    setEditorHours(availability[date] ?? []);
  }

  function toggleHour(hour: number) {
    const next = editorHours.includes(hour) ? editorHours.filter((value) => value !== hour) : [...editorHours, hour].sort((a, b) => a - b);
    setEditorHours(next);
    if (editingDate) setAvailability((saved) => {
      const updated = { ...saved, [editingDate]: next };
      try {
        window.localStorage.setItem(draftKey(code, context.userId), JSON.stringify(updated));
      } catch {
        // The in-memory draft remains available for this visit.
      }
      return updated;
    });
  }

  async function submitSchedule() {
    if (!context.roomId) {
      setError("The room response did not include a room ID, so this schedule cannot be submitted yet.");
      return;
    }
    setSubmitting(true);
    setError("");
    setStatus("Submitting your schedule…");
    try {
      await responseBody(await fetch("/api/schedules/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: code,
          roomId: context.roomId,
          userId: context.userId,
          userName: context.userName,
          userTimezone: context.timezone,
          busySlots: Object.entries(availability).sort(([left], [right]) => left.localeCompare(right)).map(([date, hours]) => ({ date, hours })),
        }),
      }));
      setMembers((current) => current.map((member) => member.userId === context.userId ? { ...member, isSubmitted: true } : member));
      setStatus("Submitted · waiting for the crew");
      await loadRoom();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit your schedule.");
      setStatus("Schedule needs attention");
    } finally {
      setSubmitting(false);
    }
  }

  const submittedCount = room?.submittedCount ?? members.filter((member) => member.isSubmitted).length;
  const memberCount = Math.max(room?.memberCount ?? 0, members.length);
  const allSubmitted = room?.status === "FINISHED";
  const currentMember = members.find((member) => member.userId === context.userId);
  const today = DateTime.now().setZone(context.timezone);

  if (editingDate) {
    return <HourEditor date={editingDate} hours={editorHours} timezone={context.timezone} onToggle={toggleHour} onSave={() => setEditingDate(null)} onClose={() => setEditingDate(null)} />;
  }

  return (
    <main className="room-shell">
      <header className="room-header"><a href="/" className="wordmark">who&apos;s free, <span>gdmit</span></a><div className="room-code"><small>Plan ID num</small><strong>{code}</strong></div><div className="connection-state" aria-live="polite"><span className="status-light" aria-hidden="true" /> {status}</div></header>
      <div className="room-layout">
        <section className="schedule-panel cel-panel">
          <div className="schedule-top"><div><p className="section-kicker">your local schedule · {context.timezone}</p><h1>{today.toFormat("LLLL yyyy")}</h1></div><div className="legend"><span className="legend-swatch free" /> free <span className="legend-swatch busy" /> busy hours</div></div>
          <p className="instruction">Double-click a day to mark busy hours. Your date and hour stay in your local timezone.</p>
          <div className="weekday-row" aria-hidden="true">{["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="month-grid" aria-label={`${today.toFormat("LLLL yyyy")} calendar`}>
            {Array.from({ length: days[0] ? days[0].weekday % 7 : 0 }, (_, index) => <span className="calendar-spacer" key={`spacer-${index}`} aria-hidden="true" />)}
            {days.map((day) => {
              const date = day.toFormat("yyyy-MM-dd");
              const hours = availability[date];
              const changed = hours !== undefined;
              return <button type="button" key={date} className={`day-tile ${changed ? "has-data" : ""} ${day.hasSame(today, "day") ? "today" : ""}`} onDoubleClick={() => openDay(day)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDay(day); } }} onClick={() => setStatus("Double-click or press Enter to edit busy hours")} aria-label={`${day.toFormat("cccc, LLLL d")}${changed ? `, ${hours.length} busy hours` : ""}. Double-click or press Enter to edit.`} title="Double-click to edit busy hours">
                <span className="day-number">{day.day}</span>{changed && <span className="day-mark">{hours.length === 0 ? "wide open" : `${hours.length} busy`}</span>}
              </button>;
            })}
          </div>
          <div className="calendar-footnote"><span className="sparkle" aria-hidden="true">✦</span> Saved hours are private until you submit your schedule.</div>
        </section>
        <aside className="room-sidebar">
          <section className="members-card cel-panel"><div className="card-heading"><h2>the crew</h2><span>{submittedCount}/{memberCount} submitted</span></div>
            <div className="member-list">{members.map((member) => <div className="member-row" key={member.userId}><span className="avatar" aria-hidden="true">{member.userName.slice(0, 1).toUpperCase()}</span><span className="member-name">{member.userName}{member.userId === context.userId && <small>you</small>}</span><span className={`member-status ${member.isSubmitted ? "ready" : "waiting"}`}>{member.isSubmitted ? "submitted" : "marking"}</span></div>)}
              {memberCount > members.length && <p className="member-count-note">{memberCount - members.length} more {memberCount - members.length === 1 ? "member" : "members"} in this room</p>}
            </div>
            <button type="button" className="primary-button wide-button" onClick={() => void submitSchedule()} disabled={submitting || !room}>{submitting ? "Sending your hours…" : currentMember?.isSubmitted ? "Update my schedule" : "Submit my schedule"}</button>
          </section>
          <section className={`recommendation-card cel-panel ${allSubmitted ? "is-ready" : ""}`}><div className="card-heading"><h2>quietest overlap</h2><span className="sparkle" aria-hidden="true">✦</span></div>{allSubmitted ? <><p className="recommendation-intro">The room found the soft spots. Fewer busy marks means more people can show up.</p>{room?.explanation && <p>{room.explanation}</p>}<div className="recommendation-list">{room?.recommendations.slice(0, 5).map((recommendation) => <div className="recommendation-row" key={recommendation.startsAtUtc}><strong>{formatSlot(recommendation.startsAtUtc, context.timezone)}</strong><span>{recommendation.availableCount} free · {recommendation.busyCount} busy</span></div>)}</div>{!room?.recommendations.length && !room?.explanation && <p>No shared times found yet.</p>}</> : <div className="waiting-state"><span className="orbit-icon" aria-hidden="true">◌</span><p>Waiting for everyone to submit. The good times will bubble up here.</p></div>}</section>
          {error && <p className="form-error" role="alert">{error}</p>}
        </aside>
      </div>
    </main>
  );
}

function HourEditor({ date, hours, timezone, onToggle, onSave, onClose }: { date: string; hours: number[]; timezone: string; onToggle: (hour: number) => void; onSave: () => void; onClose: () => void }) {
  const label = DateTime.fromISO(date, { zone: timezone }).toFormat("cccc, LLLL d");
  return <main className="editor-shell"><section className="editor-panel cel-panel" aria-labelledby="inspector-title">
    <button type="button" className="back-button" onClick={onClose}>← back to the month</button>
    <div className="editor-heading"><div><p className="section-kicker">busy hour inspector · {timezone}</p><h1 id="inspector-title">{label}</h1><p>Select each hour as Free or Busy. Your edits remain saved as a draft when you close.</p></div><div className="editor-count"><strong>{hours.length}</strong><span>busy hours</span></div></div>
    <div className="hour-grid-scroll" role="region" aria-label={`24 hours for ${label}`} tabIndex={0}><div className="hour-grid">{Array.from({ length: 24 }, (_, hour) => { const busy = hours.includes(hour); return <button type="button" key={hour} className={`hour-cell ${busy ? "is-busy" : ""}`} onClick={() => onToggle(hour)} aria-pressed={busy} aria-label={`${DateTime.fromObject({ hour }, { zone: timezone }).toFormat("h a")}, ${busy ? "Busy" : "Free"}`}><span>{String(hour).padStart(2, "0")}</span><small>{DateTime.fromObject({ hour }, { zone: timezone }).toFormat("ha")}</small><b>{busy ? "Busy" : "Free"}</b></button>; })}</div></div>
    <div className="editor-actions"><span>Press Escape to close · your draft is kept</span><button type="button" className="primary-button" onClick={onSave}>Done with this day</button></div>
  </section></main>;
}
