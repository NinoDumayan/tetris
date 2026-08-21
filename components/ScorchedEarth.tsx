"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CANVAS_W,
  CANVAS_H,
  TERRAIN_SEGMENTS,
  SEGMENT_W,
  MAX_POWER,
  MIN_POWER,
  WEAPONS,
  MAX_HP,
  type GameState,
  type WeaponType,
  initGame,
  fire,
  tick,
  switchWeapon,
  aiTurn,
  terrainY,
} from "@/lib/scorched-earth";

const COLORS = {
  terrain: "#0d4f3c",
  terrainStroke: "#22d3ee",
  p1: "#22d3ee",
  p2: "#f43f5e",
  projectile: "#facc15",
  explosion: "#ff6b2b",
};

type Mode = "1p" | "2p" | null;

export default function ScorchedEarth() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initGame());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const [mode, setMode] = useState<Mode>(null);
  const [hud, setHud] = useState({
    p1hp: MAX_HP,
    p2hp: MAX_HP,
    p1weapon: "cannon" as WeaponType,
    p2weapon: "cannon" as WeaponType,
    p1ammo: { cannon: 99, missile: 4, laser: 2 },
    p2ammo: { cannon: 99, missile: 4, laser: 2 },
    currentPlayer: 0,
    phase: "aim" as string,
    message: "",
    turnTimer: 0,
  });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  }>({ startX: 0, startY: 0, currentX: 0, currentY: 0, active: false });

  const hoverRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  const startMode = (m: Mode) => {
    setMode(m);
    gameRef.current = initGame();
  };

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, s: GameState) => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.fillStyle = "#0a0e1a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.beginPath();
      ctx.moveTo(0, s.terrain[0]);
      for (let i = 1; i < TERRAIN_SEGMENTS; i++) {
        ctx.lineTo(i * SEGMENT_W, s.terrain[i]);
      }
      ctx.lineTo(CANVAS_W, CANVAS_H);
      ctx.lineTo(0, CANVAS_H);
      ctx.closePath();
      ctx.fillStyle = COLORS.terrain;
      ctx.fill();
      ctx.strokeStyle = COLORS.terrainStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      for (let pi = 0; pi < 2; pi++) {
        const tank = s.tanks[pi];
        if (!tank.alive) continue;
        const tx = tank.x;
        const ty = terrainY(s.terrain, tx) - 10;
        const color = pi === 0 ? COLORS.p1 : COLORS.p2;

        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillRect(tx - 8, ty - 4, 16, 8);
        ctx.fillRect(tx - 2, ty - 10, 4, 6);

        ctx.shadowBlur = 0;
        const hpW = 24;
        const hpH = 3;
        const hpRatio = tank.hp / MAX_HP;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(tx - hpW / 2, ty - 16, hpW, hpH);
        ctx.fillStyle = hpRatio > 0.3 ? "#22c55e" : "#ef4444";
        ctx.fillRect(tx - hpW / 2, ty - 16, hpW * hpRatio, hpH);
      }

      if (s.phase === "aim" && s.tanks[s.currentPlayer].alive) {
        const tank = s.tanks[s.currentPlayer];
        const tx = tank.x;
        const ty = terrainY(s.terrain, tx) - 10;
        const color = s.currentPlayer === 0 ? COLORS.p1 : COLORS.p2;

        let angle = 60;
        let power = 6;

        const cursorX = dragRef.current.active ? dragRef.current.currentX : hoverRef.current.active ? hoverRef.current.x : tx;
        const cursorY = dragRef.current.active ? dragRef.current.currentY : hoverRef.current.active ? hoverRef.current.y : ty;
        const dx = cursorX - tx;
        const dy = cursorY - ty;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          angle = Math.atan2(-dy, dx) * (180 / Math.PI);
          if (angle < 5) angle = 5;
          if (angle > 175) angle = 175;
          if (dragRef.current.active) {
            const dragDist = Math.hypot(
              dragRef.current.currentX - dragRef.current.startX,
              dragRef.current.currentY - dragRef.current.startY,
            );
            power = Math.min(MAX_POWER, Math.max(MIN_POWER, dragDist / 40));
          } else {
            power = 6;
          }
        }

        const rad = (-angle * Math.PI) / 180;
        const lineLen = power * 12;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 2);
        ctx.lineTo(tx + Math.cos(rad) * lineLen, ty - 2 + Math.sin(rad) * lineLen);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = color;
        ctx.font = "11px monospace";
        ctx.fillText(`Angle: ${Math.round(angle)}°`, tx - 40, ty - 22);
        ctx.fillText(`Power: ${power.toFixed(1)}`, tx - 40, ty - 34);
      }

      if (s.prevTrail.length > 1) {
        for (let i = 0; i < s.prevTrail.length; i++) {
          const alpha = 0.06 + 0.18 * (i / s.prevTrail.length);
          const radius = 0.8 + (i / s.prevTrail.length) * 0.8;
          ctx.beginPath();
          ctx.arc(s.prevTrail[i].x, s.prevTrail[i].y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`;
          ctx.fill();
        }
      }

      if (s.trail.length > 1) {
        for (let i = 0; i < s.trail.length; i++) {
          const alpha = 0.15 + 0.55 * (i / s.trail.length);
          const radius = 1 + (i / s.trail.length) * 1.5;
          ctx.beginPath();
          ctx.arc(s.trail[i].x, s.trail[i].y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(250, 204, 21, ${alpha})`;
          ctx.fill();
        }
      }

      if (s.projectile?.alive) {
        const p = s.projectile;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.projectile;
        ctx.shadowColor = COLORS.projectile;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (s.explosion) {
        const e = s.explosion;
        const progress = Math.min(1, e.elapsed / 500);
        const alpha = 1 - progress;
        const r = e.radius * (0.5 + progress * 0.5);

        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 107, 43, ${alpha * 0.6})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.8})`;
        ctx.fill();
      }

      for (const p of s.particles) {
        const alpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px monospace";
      if (s.phase === "aim") {
        const remaining = Math.max(0, 10 - s.turnTimer / 1000);
        ctx.fillText(`Time: ${remaining.toFixed(0)}s`, CANVAS_W - 100, 20);
      }
    },
    [],
  );

  useEffect(() => {
    if (!mode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const loop = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const dt = Math.min(now - lastTimeRef.current, 50);
      lastTimeRef.current = now;

      const s = gameRef.current;
      tick(s, dt);

      if (mode === "1p" && s.phase === "aim" && s.currentPlayer === 1 && s.turnTimer < 100) {
        setTimeout(() => {
          if (gameRef.current.phase === "aim" && gameRef.current.currentPlayer === 1) {
            aiTurn(gameRef.current);
          }
        }, 600);
      }

      draw(ctx, s);

      setHud({
        p1hp: s.tanks[0].hp,
        p2hp: s.tanks[1].hp,
        p1weapon: s.tanks[0].activeWeapon,
        p2weapon: s.tanks[1].activeWeapon,
        p1ammo: { ...s.tanks[0].ammo },
        p2ammo: { ...s.tanks[1].ammo },
        currentPlayer: s.currentPlayer,
        phase: s.phase,
        message: s.message,
        turnTimer: s.turnTimer,
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, draw]);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const s = gameRef.current;
    if (s.phase !== "aim" || s.currentPlayer === 1) return;
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    dragRef.current = { startX: x, startY: y, currentX: x, currentY: y, active: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    hoverRef.current = { x, y, active: true };
    if (dragRef.current.active) {
      dragRef.current.currentX = x;
      dragRef.current.currentY = y;
    }
  };

  const handlePointerLeave = () => {
    hoverRef.current.active = false;
    if (dragRef.current.active) {
      dragRef.current.active = false;
    }
  };

  const handlePointerUp = () => {
    if (!dragRef.current.active) return;
    const s = gameRef.current;
    if (s.phase !== "aim" || s.currentPlayer === 1) {
      dragRef.current.active = false;
      return;
    }

    const dx = dragRef.current.currentX - dragRef.current.startX;
    const dy = dragRef.current.currentY - dragRef.current.startY;
    const dragDist = Math.hypot(dx, dy);

    if (dragDist < 10) {
      dragRef.current.active = false;
      return;
    }

    const tx = s.tanks[s.currentPlayer].x;
    const ty = terrainY(s.terrain, tx) - 10;
    const fdx = dragRef.current.currentX - tx;
    const fdy = dragRef.current.currentY - ty;
    let angle = Math.atan2(-fdy, fdx) * (180 / Math.PI);
    if (angle < 5) angle = 5;
    if (angle > 175) angle = 175;
    const power = Math.min(MAX_POWER, Math.max(MIN_POWER, dragDist / 40));

    fire(s, angle, power);
    dragRef.current.active = false;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const s = gameRef.current;
    if (s.phase !== "aim" || s.currentPlayer === 1) return;
    if (e.key === "Tab") {
      e.preventDefault();
      switchWeapon(s.tanks[s.currentPlayer]);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!mode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="neon-title text-3xl tracking-[0.2em]">SCORCHED EARTH</h1>
        <p className="text-sm text-slate-400">Artillery warfare — aim, fire, destroy.</p>
        <div className="flex gap-4">
          <button className="neon-btn" onClick={() => startMode("1p")}>
            1P vs AI
          </button>
          <button className="neon-btn" onClick={() => startMode("2p")}>
            2P Hot-seat
          </button>
        </div>
      </div>
    );
  }

  const isP1Turn = hud.currentPlayer === 0 && hud.phase === "aim";

  return (
    <div className="flex flex-1 flex-col items-center gap-3 p-4">
      <div className="flex w-full max-w-[800px] items-center justify-between">
        <div className={`panel px-3 py-2 text-sm ${hud.currentPlayer === 0 ? "ring-1 ring-cyan-400" : ""}`}>
          <span className="label mr-2">P1</span>
          <span className="value">{hud.p1hp}</span>
          <span className="ml-2 text-xs text-slate-500">
            {WEAPONS[hud.p1weapon].label}
            {hud.p1weapon !== "cannon" && ` ×${hud.p1ammo[hud.p1weapon]}`}
          </span>
        </div>
        <div className="text-center">
          {hud.message && (
            <p className="text-xs text-yellow-400">{hud.message}</p>
          )}
        </div>
        <div className={`panel px-3 py-2 text-sm ${hud.currentPlayer === 1 ? "ring-1 ring-rose-400" : ""}`}>
          <span className="label mr-2">P2</span>
          <span className="value">{hud.p2hp}</span>
          <span className="ml-2 text-xs text-slate-500">
            {WEAPONS[hud.p2weapon].label}
            {hud.p2weapon !== "cannon" && ` ×${hud.p2ammo[hud.p2weapon]}`}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="max-w-full rounded border border-slate-800"
        style={{ cursor: isP1Turn ? "crosshair" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />

      <div className="flex gap-3">
        {hud.phase === "aim" && isP1Turn && (
          <button
            className="neon-btn ghost text-xs"
            onClick={() => switchWeapon(gameRef.current.tanks[gameRef.current.currentPlayer])}
          >
            Switch Weapon [Tab]
          </button>
        )}
        {hud.phase === "gameover" && (
          <button className="neon-btn" onClick={() => startMode(mode)}>
            Rematch
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <button className="neon-btn ghost text-xs" onClick={() => setMode(null)}>
          Back to Menu
        </button>
      </div>
    </div>
  );
}