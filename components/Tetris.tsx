"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLS,
  COLORS,
  ROWS,
  SHAPES,
  CLEAR_ANIMATION_MS,
  finalizeClear,
  ghostY,
  gravityTick,
  hardDrop,
  hold as holdPiece,
  initGame,
  levelSpeed,
  moveLeft,
  moveRight,
  rotate,
  softDrop,
  PREVIEW_COUNT,
  type GameState,
  type PieceType,
  type Status,
} from "@/lib/tetris";

const CELL = 30;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const PREVIEW_CELL = 22;

function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number, responsive = false) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (responsive) {
    canvas.style.width = `min(${w}px, 100vw - 1rem)`;
    canvas.style.height = `auto`;
    canvas.style.aspectRatio = `${w} / ${h}`;
  } else {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
  ghost = false,
) {
  const pad = 1;
  const radius = Math.max(2, size * 0.16);
  ctx.save();
  if (ghost) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px + pad, py + pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(px + pad, py + pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(
      px + pad + 1.5,
      py + pad + 1.5,
      size - (pad + 1.5) * 2,
      (size - (pad + 1.5) * 2) * 0.34,
      radius * 0.6,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: number[][],
  px: number,
  py: number,
  cell: number,
  color: string,
  ghost = false,
) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      drawBlock(ctx, px + c * cell, py + r * cell, cell, color, ghost);
    }
  }
}

const SPRITE_SCALE = 2;

function createBlockSprite(color: string, ghost = false): HTMLCanvasElement {
  const size = CELL * SPRITE_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pad = 1 * SPRITE_SCALE;
  const radius = Math.max(2, CELL * 0.16) * SPRITE_SCALE;
  if (ghost) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * SPRITE_SCALE;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = CELL * 0.5 * SPRITE_SCALE;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(
      pad + 1.5 * SPRITE_SCALE,
      pad + 1.5 * SPRITE_SCALE,
      size - (pad + 1.5 * SPRITE_SCALE) * 2,
      (size - (pad + 1.5 * SPRITE_SCALE) * 2) * 0.34,
      radius * 0.6,
    );
    ctx.fill();
  }
  return canvas;
}

function drawPreviewShape(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  slotH: number,
  type: PieceType | null,
) {
  if (!type) return;
  const shape = SHAPES[type];
  const sw = shape[0].length * PREVIEW_CELL;
  const sh = shape.length * PREVIEW_CELL;
  drawShape(
    ctx,
    shape,
    Math.round((w - sw) / 2),
    Math.round(top + (slotH - sh) / 2),
    PREVIEW_CELL,
    COLORS[type],
  );
}

interface Hud {
  score: number;
  lines: number;
  level: number;
  status: Status;
  nextPiece: string;
}

export default function Tetris() {
  const boardRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const dropSoundRef = useRef<HTMLAudioElement | null>(null);
  const unevenSoundRef = useRef<HTMLAudioElement | null>(null);

  const playDropSound = () => {
    if (!dropSoundRef.current) {
      dropSoundRef.current = new Audio("/sounds/oohh_chinese_man_sound_.mp3");
    }
    const audio = dropSoundRef.current;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };

  const playUnevenSound = () => {
    if (!unevenSoundRef.current) {
      unevenSoundRef.current = new Audio("/sounds/aray-koooo-1.mp3");
    }
    const audio = unevenSoundRef.current;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };

  const stateRef = useRef<GameState>(initGame());
  const prevHud = useRef<Hud>({ score: 0, lines: 0, level: 1, status: "playing", nextPiece: "" });
  const timersRef = useRef<Map<string, { t: number; i: number }>>(new Map());
  const [hud, setHud] = useState<Hud>({
    score: 0,
    lines: 0,
    level: 1,
    status: "playing",
    nextPiece: "",
  });

  const syncHud = () => {
    const s = stateRef.current;
    const next: Hud = {
      score: s.score,
      lines: s.lines,
      level: s.level,
      status: s.status,
      nextPiece: s.queue[0]?.toUpperCase() ?? "",
    };
    const p = prevHud.current;
    if (
      next.score !== p.score ||
      next.lines !== p.lines ||
      next.level !== p.level ||
      next.status !== p.status ||
      next.nextPiece !== p.nextPiece
    ) {
      prevHud.current = next;
      setHud(next);
    }
  };

  const stopRepeat = (code: string) => {
    const map = timersRef.current;
    const entry = map.get(code);
    if (entry) {
      if (entry.t) window.clearTimeout(entry.t);
      if (entry.i) window.clearInterval(entry.i);
      map.delete(code);
    }
  };

  const startRepeat = (code: string, fn: () => void) => {
    stopRepeat(code);
    const map = timersRef.current;
    const t = window.setTimeout(() => {
      const i = window.setInterval(fn, 45);
      map.set(code, { t: 0, i });
    }, 160);
    map.set(code, { t, i: 0 });
  };

  const restart = () => {
    stateRef.current = initGame();
    syncHud();
  };

  const togglePause = () => {
    const s = stateRef.current;
    if (s.status === "playing") s.status = "paused";
    else if (s.status === "paused") s.status = "playing";
    syncHud();
  };

  useEffect(() => {
    const boardCanvas = boardRef.current;
    const holdCanvas = holdRef.current;
    const nextCanvas = nextRef.current;
    const timers = timersRef.current;
    if (!boardCanvas || !holdCanvas || !nextCanvas) return;

    const boardCtx = fitCanvas(boardCanvas, BOARD_W, BOARD_H, true);
    const holdCtx = fitCanvas(holdCanvas, 100, 60);
    const nextCtx = fitCanvas(nextCanvas, 100, 220);

    const blockSprites = new Map<string, HTMLCanvasElement>();
    for (const type of Object.keys(COLORS) as PieceType[]) {
      blockSprites.set(type, createBlockSprite(COLORS[type]));
      blockSprites.set(`${type}:ghost`, createBlockSprite(COLORS[type], true));
    }

    const drawShapeSprites = (
      shape: number[][],
      px: number,
      py: number,
      type: PieceType,
      ghost = false,
    ) => {
      const key = ghost ? `${type}:ghost` : type;
      const sprite = blockSprites.get(key)!;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          boardCtx.drawImage(sprite, px + c * CELL, py + r * CELL, CELL, CELL);
        }
      }
    };

    const renderBoard = () => {
      const s = stateRef.current;
      boardCtx.clearRect(0, 0, BOARD_W, BOARD_H);
      boardCtx.fillStyle = "rgba(6, 10, 24, 0.9)";
      boardCtx.fillRect(0, 0, BOARD_W, BOARD_H);

      boardCtx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      boardCtx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        boardCtx.beginPath();
        boardCtx.moveTo(c * CELL + 0.5, 0);
        boardCtx.lineTo(c * CELL + 0.5, BOARD_H);
        boardCtx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        boardCtx.beginPath();
        boardCtx.moveTo(0, r * CELL + 0.5);
        boardCtx.lineTo(BOARD_W, r * CELL + 0.5);
        boardCtx.stroke();
      }

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = s.board[r][c];
          if (cell !== 0) {
            boardCtx.drawImage(
              blockSprites.get(cell)!,
              c * CELL,
              r * CELL,
              CELL,
              CELL,
            );
          }
        }
      }

      if (s.status === "playing") {
        if (s.clearing) {
          const progress = 1 - s.clearing.remaining / CLEAR_ANIMATION_MS;
          const pulse = 0.35 + 0.4 * Math.sin(progress * Math.PI * 5);
          boardCtx.save();
          for (const r of s.clearing.rows) {
            boardCtx.fillStyle = `rgba(255,255,255,${pulse.toFixed(3)})`;
            boardCtx.shadowColor = "#ffffff";
            boardCtx.shadowBlur = 18;
            boardCtx.beginPath();
            boardCtx.roundRect(
              1.5,
              r * CELL + 1.5,
              BOARD_W - 3,
              CELL - 3,
              4,
            );
            boardCtx.fill();
          }
          boardCtx.restore();
        } else {
          const gy = ghostY(s.board, s.current.shape, s.current.x, s.current.y);
          drawShapeSprites(s.current.shape, s.current.x * CELL, gy * CELL, s.current.type, true);
          drawShapeSprites(s.current.shape, s.current.x * CELL, s.current.y * CELL, s.current.type);
        }
      }
    };

    const render = () => {
      renderBoard();
      const s = stateRef.current;
      holdCtx.clearRect(0, 0, 100, 60);
      drawPreviewShape(holdCtx, 100, 0, 60, s.hold);

      nextCtx.clearRect(0, 0, 100, 220);
      for (let i = 0; i < PREVIEW_COUNT; i++) {
        drawPreviewShape(nextCtx, 100, 6 + i * 72, 66, s.queue[i] ?? null);
      }
      syncHud();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.code === "KeyR" && s.status === "over") {
        restart();
        return;
      }
      if (e.code === "KeyP") {
        togglePause();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const playing = s.status === "playing";
      switch (e.code) {
        case "ArrowLeft":
          e.preventDefault();
          if (playing) {
            moveLeft(s);
            startRepeat("ArrowLeft", () => moveLeft(stateRef.current));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (playing) {
            moveRight(s);
            startRepeat("ArrowRight", () => moveRight(stateRef.current));
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (playing) {
            softDrop(s);
            startRepeat("ArrowDown", () => softDrop(stateRef.current));
          }
          break;
        case "ArrowUp":
        case "KeyX":
          e.preventDefault();
          if (playing && !e.repeat) rotate(s, 1);
          break;
        case "KeyZ":
          if (playing && !e.repeat) rotate(s, -1);
          break;
        case "Space":
          e.preventDefault();
          if (playing && !e.repeat) {
            hardDrop(s);
            playDropSound();
          }
          break;
        case "KeyC":
        case "ShiftLeft":
        case "ShiftRight":
          if (playing && !e.repeat) holdPiece(s);
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => stopRepeat(e.code);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const s = stateRef.current;
      if (s.status === "playing") {
        if (s.clearing) {
          s.clearing.remaining -= dt;
          if (s.clearing.remaining <= 0) {
            finalizeClear(s);
          }
        } else {
          acc += dt;
          const interval = levelSpeed(s.level);
          while (acc >= interval) {
            gravityTick(s);
            acc -= interval;
          }
          if (acc > interval * 3) acc = interval * 3;
        }
        if (s.lastLockUneven) {
          s.lastLockUneven = false;
          playUnevenSound();
        }
      }
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      timers.forEach((entry) => {
        if (entry.t) window.clearTimeout(entry.t);
        if (entry.i) window.clearInterval(entry.i);
      });
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlay = hud.status !== "playing";

  return (
    <main className="flex min-h-dvh flex-col items-center gap-3 p-2 sm:gap-5 sm:p-4">
      <h1 className="neon-title text-3xl tracking-[0.35em] sm:text-4xl">TETRIS</h1>

      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-4">
        <aside className="panel hidden w-[124px] flex-col gap-4 p-3 sm:flex">
          <div>
            <p className="label">HOLD</p>
            <canvas ref={holdRef} className="mt-1 block" />
          </div>
          <div className="h-px bg-slate-700/60" />
          <div>
            <p className="label">SCORE</p>
            <p className="value">{hud.score.toLocaleString()}</p>
          </div>
          <div>
            <p className="label">LEVEL</p>
            <p className="value">{hud.level}</p>
          </div>
          <div>
            <p className="label">LINES</p>
            <p className="value">{hud.lines}</p>
          </div>
        </aside>

        <div className="flex flex-col items-center gap-2 sm:contents">
          <div className="panel flex w-full max-w-[320px] items-center justify-between px-3 py-2 text-xs sm:hidden">
            <div className="flex items-center gap-2">
              <span className="label">HOLD</span>
              <div className="flex items-center gap-4">
                <div>
                  <span className="label">SCORE </span>
                  <span className="value text-xs">{hud.score.toLocaleString()}</span>
                </div>
                <div>
                  <span className="label">LVL </span>
                  <span className="value text-xs">{hud.level}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative w-full max-w-[320px]">
            <canvas
              ref={boardRef}
              className="block w-full rounded-md border border-slate-700/70 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
            />
            {overlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-md bg-slate-950/80 backdrop-blur-sm">
                <p className="neon-title text-2xl sm:text-3xl">
                  {hud.status === "over" ? "GAME OVER" : "PAUSED"}
                </p>
                {hud.status === "over" && (
                  <p className="value text-center text-sm">
                    Score {hud.score.toLocaleString()}
                    <br />
                    Level {hud.level} · {hud.lines} lines
                  </p>
                )}
                <button
                  onClick={hud.status === "over" ? restart : togglePause}
                  className="neon-btn"
                >
                  {hud.status === "over" ? "PLAY AGAIN" : "RESUME"}
                </button>
                {hud.status === "paused" && (
                  <button onClick={restart} className="neon-btn ghost">
                    RESTART
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="panel hidden w-[124px] flex-col gap-3 p-3 sm:flex">
            <div>
              <p className="label">NEXT</p>
              <canvas ref={nextRef} className="mt-1 block" />
            </div>
          </div>
        </div>
      </div>

      <div className="panel flex w-full max-w-[320px] items-center justify-between px-3 py-2 text-xs sm:hidden">
        <div>
          <span className="label">NEXT </span>
          <span className="value text-xs">{hud.nextPiece ?? "—"}</span>
        </div>
        <div>
          <span className="label">LINES </span>
          <span className="value text-xs">{hud.lines}</span>
        </div>
      </div>

      <div className="hidden max-w-[520px] flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] tracking-wide text-slate-400 sm:flex">
        <span>← → move</span>
        <span>↓ soft drop</span>
        <span>↑ / X rotate</span>
        <span>Z ccw</span>
        <span>Space hard drop</span>
        <span>C / Shift hold</span>
        <span>P pause</span>
        <span>R restart</span>
      </div>

      <div className="mobile-controls">
        <div className="mobile-row">
          <button
            className="mobile-btn"
            onPointerDown={(e) => {
              e.preventDefault();
              if (stateRef.current.status !== "playing") return;
              moveLeft(stateRef.current);
              startRepeat("ArrowLeft", () => moveLeft(stateRef.current));
            }}
            onPointerUp={() => stopRepeat("ArrowLeft")}
            onPointerLeave={() => stopRepeat("ArrowLeft")}
          >
            ◀
          </button>
          <button
            className="mobile-btn"
            onPointerDown={(e) => {
              e.preventDefault();
              if (stateRef.current.status !== "playing") return;
              softDrop(stateRef.current);
              startRepeat("ArrowDown", () => softDrop(stateRef.current));
            }}
            onPointerUp={() => stopRepeat("ArrowDown")}
            onPointerLeave={() => stopRepeat("ArrowDown")}
          >
            ▼
          </button>
          <button
            className="mobile-btn"
            onPointerDown={(e) => {
              e.preventDefault();
              if (stateRef.current.status !== "playing") return;
              moveRight(stateRef.current);
              startRepeat("ArrowRight", () => moveRight(stateRef.current));
            }}
            onPointerUp={() => stopRepeat("ArrowRight")}
            onPointerLeave={() => stopRepeat("ArrowRight")}
          >
            ▶
          </button>
        </div>
        <div className="mobile-row">
          <button
            className="mobile-btn accent"
            onPointerDown={(e) => {
              e.preventDefault();
              if (stateRef.current.status !== "playing") return;
              rotate(stateRef.current, 1);
            }}
          >
            ↻
          </button>
          <button
            className="mobile-btn accent"
            onPointerDown={(e) => {
              e.preventDefault();
              if (stateRef.current.status !== "playing") return;
              hardDrop(stateRef.current);
              playDropSound();
            }}
          >
            ⏬
          </button>
          <button
            className="mobile-btn accent"
            onPointerDown={(e) => {
              e.preventDefault();
              if (stateRef.current.status !== "playing") return;
              holdPiece(stateRef.current);
            }}
          >
            ⇄
          </button>
          <button
            className="mobile-btn small"
            onClick={togglePause}
          >
            ❚❚
          </button>
        </div>
      </div>
    </main>
  );
}