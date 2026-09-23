"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ChromeScene } from "@/lib/chrome-scene";

export function ChromeWorld() {
  const pathname = usePathname();
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ChromeScene | null>(null);
  const [ready, setReady] = useState(false);
  const [titleReady, setTitleReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let disposed = false;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReduced(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    void import("@/lib/chrome-scene").then(({ createChromeScene }) => {
      if (disposed || !canvas.current) return;
      scene.current = createChromeScene(canvas.current, {
        background: () => { if (!disposed) setReady(true); },
        title: () => { if (!disposed) setTitleReady(true); },
        failed: () => { if (!disposed) { setReady(false); setTitleReady(false); } },
      });
    }).catch(() => { /* The server-rendered chrome title and static background remain usable. */ });
    return () => {
      disposed = true;
      preference.removeEventListener("change", updatePreference);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => { scene.current?.refresh(); }, [pathname, ready]);
  useEffect(() => { scene.current?.setPaused(paused || reduced); }, [paused, reduced, ready]);

  return <>
    <div className="chrome-world" data-ready={ready} data-title-ready={titleReady} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
    {ready && !reduced && <button type="button" className="motion-toggle" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? "Resume visual motion" : "Pause visual motion"}>{paused ? "Play motion" : "Pause motion"}</button>}
  </>;
}
