"use client";

import { useEffect, useRef, useState } from "react";

const START_DELAY_MS = 1800;
const FADE_IN_MS = 900;

type Flake = {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  o: number;
  sway: number;
  swaySpeed: number;
  t: number;
};

export default function Snow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const start = window.setTimeout(() => setVisible(true), START_DELAY_MS);
    return () => window.clearTimeout(start);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let flakes: Flake[] = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.scale(dpr, dpr);

      const area = window.innerWidth * window.innerHeight;
      const target = Math.round(area / 14000);
      flakes = new Array(Math.max(60, Math.min(180, target)))
        .fill(0)
        .map(() => makeFlake(true));
    };

    const makeFlake = (initial = false): Flake => {
      const r = 0.8 + Math.random() * 2.2;
      return {
        x: Math.random() * (window.innerWidth + 80) - 40,
        y: initial
          ? Math.random() * window.innerHeight
          : -10 - Math.random() * 40,
        r,
        vy: 0.12 + Math.random() * 0.28 + r * 0.04,
        vx: (Math.random() - 0.5) * 0.06,
        o: 0.35 + Math.random() * 0.5,
        sway: 14 + Math.random() * 28,
        swaySpeed: 0.0006 + Math.random() * 0.0012,
        t: Math.random() * 2000,
      };
    };

    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.fillStyle = "#A2824E";
      for (const f of flakes) {
        f.t += 16;
        f.x += f.vx + Math.sin(f.t * f.swaySpeed) * (f.sway * 0.012);
        f.y += f.vy;

        if (f.y > window.innerHeight + 8) {
          Object.assign(f, makeFlake(false));
        } else if (f.x < -30) {
          f.x = window.innerWidth + 20;
        } else if (f.x > window.innerWidth + 30) {
          f.x = -20;
        }

        ctx.globalAlpha = f.o;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [visible]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5]"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_IN_MS}ms ease-out`,
      }}
    />
  );
}
