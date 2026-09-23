"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const participantKey = "whos-free-participant";

function browserContext() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const existing = window.localStorage.getItem(participantKey);
  const participantId = existing ? JSON.parse(existing).participantId : crypto.randomUUID();
  return { timezone, participantId };
}

export function Landing() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timezone, setTimezone] = useState("detecting your timezone…");

  useEffect(() => {
    setTimezone(browserContext().timezone);
  }, []);

  function storeParticipant(name: string) {
    const context = browserContext();
    window.localStorage.setItem(participantKey, JSON.stringify({ ...context, displayName: name }));
    return context;
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!displayName.trim()) return setError("Add your name so the room knows who you are.");
    setBusy(true);
    try {
      const context = storeParticipant(displayName.trim());
      const response = await fetch("/api/v1/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), ...context }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not create a plan.");
      router.push(`/plan/${body.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a plan.");
    } finally {
      setBusy(false);
    }
  }

  async function joinPlan(event: FormEvent) {
    event.preventDefault();
    setError("");
    const code = planCode.trim().toUpperCase();
    if (!displayName.trim()) return setError("Add your name so the room knows who you are.");
    if (code.length !== 5) return setError("A plan ID has five characters.");
    setBusy(true);
    try {
      const context = storeParticipant(displayName.trim());
      const response = await fetch(`/api/v1/plans/${code}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), ...context }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not join that plan.");
      router.push(`/plan/${code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join that plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing-shell">
      <div className="memphis-dot dot-one" /><div className="memphis-dot dot-two" />
      <section className="landing-copy">
        <div className="brand-chip"><span className="brand-spark">✦</span> group timing, without the group chat spiral</div>
        <h1>Find the golden hour <em>together.</em></h1>
        <p className="lede">Everybody marks when they’re busy. The room finds the quietest overlap, even when your crew is spread across time zones.</p>
        <div className="timezone-pill"><span className="status-light" /> Your clock: {timezone}</div>
      </section>
      <section className="launch-panel cel-panel">
        <div className="panel-tab">start a room</div>
        <form onSubmit={createPlan}>
          <label htmlFor="display-name">Your name</label>
          <input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Sam, snack captain" maxLength={40} />
          <button className="primary-button" disabled={busy}>{busy ? "Warming up the room…" : "Making a legit plan.."}</button>
        </form>
        <div className="join-divider"><span>or join a plan</span></div>
        <form onSubmit={joinPlan} className="join-form">
          <label htmlFor="plan-id">Plan ID num</label>
          <div className="join-row"><input id="plan-id" value={planCode} onChange={(event) => setPlanCode(event.target.value.toUpperCase())} placeholder="5FJ8Q" maxLength={5} /><button className="secondary-button" disabled={busy}>Join</button></div>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
      <div className="landing-note">No account drama. Your room lives behind a tiny code.</div>
    </main>
  );
}
