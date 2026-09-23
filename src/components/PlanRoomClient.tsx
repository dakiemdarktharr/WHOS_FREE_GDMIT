"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import Ably from "ably";
import type { AvailabilityUpdate, PlanRoom } from "@/domain/types";

const participantKey = "whos-free-participant";

function getContext() {
  const fallback = { participantId: crypto.randomUUID(), displayName: "Guest", timezone: "UTC" };
  try {
    return JSON.parse(window.localStorage.getItem(participantKey) || JSON.stringify(fallback)) as typeof fallback;
  } catch {
    return fallback;
  }
}

function monthDays(timezone: string) {
  const now = DateTime.now().setZone(timezone);
  const start = now.startOf("month");
  return Array.from({ length: start.daysInMonth ?? 0 }, (_, index): DateTime => start.plus({ days: index }));
}

function formatSlot(iso: string, timezone: string) {
  return DateTime.fromISO(iso).setZone(timezone).toFormat("ccc, LLL d · h a");
}

export function PlanRoomClient({ code }: { code: string }) {
  const [context, setContext] = useState({ participantId: "", displayName: "Guest", timezone: "UTC" });
  const [plan, setPlan] = useState<PlanRoom | null>(null);
  const [availability, setAvailability] = useState<Record<string, number[]>>({});
  const [savedDays, setSavedDays] = useState<string[]>([]);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editorHours, setEditorHours] = useState<number[]>([]);
  const [status, setStatus] = useState("Connecting the room…");
  const [error, setError] = useState("");
  const days = useMemo(() => monthDays(context.timezone), [context.timezone]);

  useEffect(() => {
    const nextContext = getContext();
    setContext(nextContext);
    void loadRoom(nextContext);
  }, [code]);

  useEffect(() => {
    if (!context.participantId) return;
    const realtime = new Ably.Realtime({
      clientId: context.participantId,
      authCallback: async (_params, callback) => {
        try {
          const response = await fetch(`/api/v1/plans/${code}/realtime-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ participantId: context.participantId }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error?.message || "Realtime authentication failed.");
          callback(null, body);
        } catch (caught) {
          callback(caught instanceof Error ? caught.message : "Realtime authentication failed.", null);
        }
      },
    });
    const channel = realtime.channels.get(`plan:${code}`);
    channel.subscribe("availability.updated", () => void loadRoom());
    channel.presence.enter(context.displayName).catch(() => undefined);
    return () => {
      channel.unsubscribe();
      channel.presence.leave().catch(() => undefined);
      realtime.close();
    };
  }, [code, context.displayName, context.participantId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && editingDate) setEditingDate(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingDate]);

  async function loadRoom(nextContext = context) {
    try {
      const [planResponse, availabilityResponse] = await Promise.all([
        fetch(`/api/v1/plans/${code}`),
        fetch(`/api/v1/plans/${code}/availability?participantId=${encodeURIComponent(nextContext.participantId)}`),
      ]);
      const planBody = await planResponse.json();
      if (!planResponse.ok) throw new Error(planBody.error?.message || "Plan not found.");
      setPlan(planBody.plan);
      if (availabilityResponse.ok) {
        const availabilityBody = await availabilityResponse.json() as { availability: AvailabilityUpdate[] };
        const nextAvailability: Record<string, number[]> = {};
        const nextSavedDays: string[] = [];
        for (const record of availabilityBody.availability) {
          nextAvailability[record.date] = record.busyHours;
          nextSavedDays.push(record.date);
        }
        setAvailability(nextAvailability);
        setSavedDays(nextSavedDays);
      }
      setStatus("Room is live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this room.");
      setStatus("Room needs attention");
    }
  }

  function openDay(day: DateTime) {
    const date = day.toFormat("yyyy-MM-dd");
    setEditingDate(date);
    setEditorHours(availability[date] ?? []);
  }

  function toggleHour(hour: number) {
    setEditorHours((current) => current.includes(hour) ? current.filter((value) => value !== hour) : [...current, hour].sort((a, b) => a - b));
  }

  async function saveDay() {
    if (!editingDate) return;
    const allDays = [...new Set([...savedDays, editingDate])].sort();
    const windowStart = allDays[0];
    const windowEnd = allDays[allDays.length - 1];
    setAvailability((current) => ({ ...current, [editingDate]: editorHours }));
    setSavedDays(allDays);
    setEditingDate(null);
    setStatus("Saving your hours…");
    try {
      const response = await fetch(`/api/v1/plans/${code}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: context.participantId, timezone: context.timezone, date: editingDate, busyHours: editorHours, windowStart, windowEnd }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not save this day.");
      setPlan(body.plan);
      setStatus("Saved · the room is updating live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this day.");
      setStatus("Saved locally · server sync needs attention");
    }
  }

  async function confirmMonth() {
    setStatus("Locking in your month…");
    try {
      const response = await fetch(`/api/v1/plans/${code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: context.participantId, status: "confirmed" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not confirm your month.");
      setPlan(body.plan);
      setStatus("Confirmed · waiting for the crew");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not confirm your month.");
    }
  }

  const submittedCount = plan?.members.filter((member) => member.submitted).length ?? 0;
  const allSubmitted = Boolean(plan && plan.members.length > 0 && submittedCount === plan.members.length);
  const currentMember = plan?.members.find((member) => member.participantId === context.participantId);

  if (editingDate) {
    return <HourEditor date={editingDate} hours={editorHours} onToggle={toggleHour} onSave={saveDay} onBack={() => setEditingDate(null)} timezone={context.timezone} />;
  }

  return (
    <main className="room-shell">
      <header className="room-header"><a href="/" className="wordmark">who&apos;s free, <span>gdmit</span></a><div className="room-code"><small>Plan ID num</small><strong>{code}</strong></div><div className="connection-state"><span className="status-light" /> {status}</div></header>
      <div className="room-layout">
        <section className="schedule-panel cel-panel">
          <div className="schedule-top"><div><p className="section-kicker">your local schedule</p><h1>{DateTime.now().setZone(context.timezone).toFormat("LLLL yyyy")}</h1></div><div className="legend"><span className="legend-swatch free" /> untouched <span className="legend-swatch busy" /> busy hours saved</div></div>
          <p className="instruction">Double-click a day to mark the hours you can&apos;t go. Save even a blank day when you&apos;re totally free.</p>
          <div className="weekday-row">{["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="month-grid">{days.map((day) => { const date = day.toFormat("yyyy-MM-dd"); const selected = date in availability; return <button key={date} className={`day-tile ${selected ? "has-data" : ""} ${day.hasSame(DateTime.now().setZone(context.timezone), "day") ? "today" : ""}`} onDoubleClick={() => openDay(day)} onClick={() => setStatus("Double-click to edit busy hours") }><span className="day-number">{day.day}</span>{selected && <span className="day-mark">{availability[date].length === 0 ? "wide open" : `${availability[date].length} busy`}</span>}</button>; })}</div>
          <div className="calendar-footnote"><span className="sparkle">✦</span> Your shared window begins at the first day you save and ends at the last.</div>
        </section>
        <aside className="room-sidebar">
          <section className="members-card cel-panel"><div className="card-heading"><h2>the crew</h2><span>{submittedCount}/{plan?.members.length ?? 0} ready</span></div><div className="member-list">{plan?.members.map((member) => <div className="member-row" key={member.participantId}><span className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</span><span className="member-name">{member.displayName}{member.participantId === context.participantId && <small>you</small>}</span><span className={`member-status ${member.confirmed ? "confirmed" : member.submitted ? "ready" : "waiting"}`}>{member.confirmed ? "locked" : member.submitted ? "ready" : "marking"}</span></div>)}</div><button className="secondary-button wide-button" onClick={confirmMonth} disabled={!currentMember?.submitted || currentMember.confirmed}>{currentMember?.confirmed ? "Month confirmed" : "Confirm my month"}</button></section>
          <section className={`recommendation-card cel-panel ${allSubmitted ? "is-ready" : ""}`}><div className="card-heading"><h2>quietest overlap</h2><span className="sparkle">✦</span></div>{allSubmitted ? <><p className="recommendation-intro">The room found the soft spots. Fewer busy marks means more people can actually show up.</p><div className="recommendation-list">{plan?.recommendations.slice(0, 5).map((recommendation) => <div className="recommendation-row" key={recommendation.startsAtUtc}><strong>{formatSlot(recommendation.startsAtUtc, context.timezone)}</strong><span>{recommendation.availableCount} free · {recommendation.busyCount} busy</span></div>)}</div></> : <div className="waiting-state"><span className="orbit-icon">◌</span><p>Waiting for everyone to finish their month. The good times will bubble up here.</p></div>}</section>
          {error && <p className="form-error" role="alert">{error}</p>}
        </aside>
      </div>
    </main>
  );
}

function HourEditor({ date, hours, timezone, onToggle, onSave, onBack }: { date: string; hours: number[]; timezone: string; onToggle: (hour: number) => void; onSave: () => void; onBack: () => void }) {
  const label = DateTime.fromISO(date, { zone: timezone }).toFormat("cccc, LLLL d");
  return <main className="editor-shell"><div className="editor-panel cel-panel"><button className="back-button" onClick={onBack}>← back to the month</button><div className="editor-heading"><div><p className="section-kicker">busy hour editor</p><h1>{label}</h1><p>Tap the hours when you are busy. Blank means fully free.</p></div><div className="editor-count"><strong>{hours.length}</strong><span>busy hours</span></div></div><div className="hour-grid">{Array.from({ length: 24 }, (_, hour) => <button key={hour} className={`hour-cell ${hours.includes(hour) ? "is-busy" : ""}`} onClick={() => onToggle(hour)} aria-pressed={hours.includes(hour)}><span>{String(hour).padStart(2, "0")}</span><small>{DateTime.fromObject({ hour }, { zone: timezone }).toFormat("ha")}</small></button>)}</div><div className="editor-actions"><span>Esc also goes back</span><button className="primary-button" onClick={onSave}>Save this day</button></div></div></main>;
}
