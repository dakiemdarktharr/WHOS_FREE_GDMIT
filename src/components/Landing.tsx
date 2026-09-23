"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { contextForJoin, newRoomContext, saveRoomContext } from "@/lib/room-session";

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
  const titleRef = useRef<HTMLDivElement>(null);
  const [launchVisible, setLaunchVisible] = useState(false);

  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);

  useEffect(() => {
    const launchSection = document.querySelector<HTMLElement>("[data-launch-section]");
    if (!launchSection) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setLaunchVisible(true); },
      { threshold: 0.18 },
    );
    observer.observe(launchSection);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      titleRef.current?.style.setProperty("--tilt-x", "0deg");
      titleRef.current?.style.setProperty("--tilt-y", "0deg");
    };
    const move = (event: globalThis.PointerEvent) => {
      if (motion.matches || event.pointerType === "touch") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stage = titleRef.current;
        if (!stage) return;
        const bounds = stage.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)));
        const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)));
        stage.style.setProperty("--tilt-x", `${x * 8}deg`);
        stage.style.setProperty("--tilt-y", `${-y * 8}deg`);
      });
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", reset);
    motion.addEventListener("change", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!displayName.trim()) return setError("Add your name so the room knows who you are.");
    setBusy(true);
    try {
      const context = newRoomContext(displayName.trim());
      const body = await readBody(await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: context.userId, userName: context.userName, creatorTimezone: context.timezone }),
      }));
      const room = body.room;
      const roomCode = room?.roomCode as string | undefined;
      if (!roomCode || !/^\d{5}$/.test(roomCode)) throw new Error("The server returned an invalid Plan ID.");
      saveRoomContext(roomCode, { ...context, roomId: room.roomId ?? "" });
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
      const context = contextForJoin(roomCode, displayName.trim());
      const body = await readBody(await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, userId: context.userId, userName: context.userName, userTimezone: context.timezone }),
      })) as { roomId?: string };
      saveRoomContext(roomCode, { ...context, roomId: body.roomId || "" });
      router.push(`/room/${roomCode}` as Route);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join that plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing-shell">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="landing-copy hero-copy">
          <div className="hero-title-stage" ref={titleRef}>
            <h1 id="hero-title" className="hero-title">
              <span className="chrome-word" data-text="WHO'S FREE">WHO&apos;S FREE</span>
              <span className="chrome-word" data-text="GODAMMITTTT?">GODAMMITTTT?</span>
            </h1>
            <span className="chrome-star star-one" aria-hidden="true">✦</span>
            <span className="chrome-star star-two" aria-hidden="true">✦</span>
          </div>
        </div>
        <a className="scroll-cue" href="#start">Make it happen <span className="scroll-cue-arrow" aria-hidden="true">↓</span></a>
      </section>
      <section id="start" className={`landing-launch ${launchVisible ? "is-visible" : ""}`} data-launch-section aria-labelledby="launch-title">
        <div className="launch-intro">
          <h2 id="launch-title">Less chat.<br />More plans.</h2>
          <p>Mark busy hours. Find your overlap.</p>
          <div className="timezone-pill"><span className="status-light" aria-hidden="true" />{timezone}</div>
        </div>
        <section className="launch-panel cel-panel" aria-label="Create or join a room">
          <div className="panel-tab">create a group argument</div>
          <form onSubmit={createRoom}>
            <label htmlFor="display-name">Your name</label>
            <input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Sam" maxLength={40} autoComplete="name" required />
            <button className="primary-button" disabled={busy}>{busy ? "Warming up the room…" : "Making a legit plan.."}</button>
          </form>
          <div className="join-divider"><span>or join a plan</span></div>
          <form onSubmit={joinRoom} className="join-form">
            <label htmlFor="plan-id">Plan ID num</label>
            <div className="join-row"><input id="plan-id" inputMode="numeric" pattern="[0-9]{5}" value={planCode} onChange={(event) => setPlanCode(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="48307" maxLength={5} autoComplete="one-time-code" required /><button className="secondary-button" disabled={busy}>Join</button></div>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </section>
    </main>
  );
}
