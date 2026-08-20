"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLS,
  COLORS,
  ROWS,
  SHAPES,
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

function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function createBlockSprite(color: string, ghost = false): HTMLCanvasElement {
  const size = CELL;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pad = 1;
  const radius = Math.max(2, size * 0.16);
  if (ghost) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(
      pad + 1.5,
      pad + 1.5,
      size - (pad + 1.5) * 2,
      (size - (pad + 1.5) * 2) * 0.34,
      radius * 0.6,
    );
    ctx.fill();
  }
  return canvas;
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
}

export default function Tetris() {
  const boardRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const dropSoundRef = useRef<HTMLAudioElement | null>(null);

  const playDropSound = () => {
    if (!dropSoundRef.current) {
      dropSoundRef.current = new Audio("/sounds/oohh_chinese_man_sound_.mp3");
    }
    const audio = dropSoundRef.current;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };

  const stateRef = useRef<GameState>(initGame());
  const prevHud = useRef<Hud>({ score: 0, lines: 0, level: 1, status: "playing" });
  const timersRef = useRef<Map<string, { t: number; i: number }>>(new Map());
  const [hud, setHud] = useState<Hud>({
    score: 0,
    lines: 0,
    level: 1,
    status: "playing",
  });

  const syncHud = () => {
    const s = stateRef.current;
    const next: Hud = {
      score: s.score,
      lines: s.lines,
      level: s.level,
      status: s.status,
    };
    const p = prevHud.current;
    if (
      next.score !== p.score ||
      next.lines !== p.lines ||
      next.level !== p.level ||
      next.status !== p.status
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

    const boardCtx = fitCanvas(boardCanvas, BOARD_W, BOARD_H);
    const holdCtx = fitCanvas(holdCanvas, 100, 60);
    const nextCtx = fitCanvas(nextCanvas, 100, 220);

    const blockSprites = new Map<string, HTMLCanvasElement>();
    for (const type of Object.keys(COLORS) as PieceType[]) {
      blockSprites.set(type, createBlockSprite(COLORS[type]));
      blockSprites.set(`${type}:ghost`, createBlockSprite(COLORS[type], true));
    }

    const boardLayer = document.createElement("canvas");
    boardLayer.width = boardCanvas.width;
    boardLayer.height = boardCanvas.height;
    const layerCtx = boardLayer.getContext("2d")!;
    const layerDpr = boardCanvas.width / BOARD_W;
    layerCtx.setTransform(layerDpr, 0, 0, layerDpr, 0, 0);

    const renderBoardLayer = () => {
      const s = stateRef.current;
      layerCtx.clearRect(0, 0, BOARD_W, BOARD_H);
      layerCtx.fillStyle = "rgba(6, 10, 24, 0.9)";
      layerCtx.fillRect(0, 0, BOARD_W, BOARD_H);

      layerCtx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      layerCtx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        layerCtx.beginPath();
        layerCtx.moveTo(c * CELL + 0.5, 0);
        layerCtx.lineTo(c * CELL + 0.5, BOARD_H);
        layerCtx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        layerCtx.beginPath();
        layerCtx.moveTo(0, r * CELL + 0.5);
        layerCtx.lineTo(BOARD_W, r * CELL + 0.5);
        layerCtx.stroke();
      }

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = s.board[r][c];
          if (cell !== 0) {
            layerCtx.drawImage(blockSprites.get(cell)!, c * CELL, r * CELL);
          }
        }
      }
    };

    const drawShape = (
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
          boardCtx.drawImage(sprite, px + c * CELL, py + r * CELL);
        }
      }
    };

    let layerFp = -1;
    const boardFingerprint = () => {
      const s = stateRef.current;
      let fp = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = s.board[r][c];
          if (cell !== 0) {
            fp = (fp + cell.charCodeAt(0) * (r * COLS + c + 1)) % 2147483647;
          }
        }
      }
      return fp;
    };

    const renderBoard = () => {
      const s = stateRef.current;
      const fp = boardFingerprint();
      if (fp !== layerFp) {
        renderBoardLayer();
        layerFp = fp;
      }
      boardCtx.clearRect(0, 0, BOARD_W, BOARD_H);
      boardCtx.drawImage(boardLayer, 0, 0);

      if (s.status === "playing") {
        const gy = ghostY(s.board, s.current.shape, s.current.x, s.current.y);
        drawShape(s.current.shape, s.current.x * CELL, gy * CELL, s.current.type, true);
        drawShape(s.current.shape, s.current.x * CELL, s.current.y * CELL, s.current.type);
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
        acc += dt;
        const interval = levelSpeed(s.level);
        while (acc >= interval) {
          gravityTick(s);
          acc -= interval;
        }
        if (acc > interval * 3) acc = interval * 3;
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-4">
      <h1 className="neon-title text-4xl tracking-[0.35em]">TETRIS</h1>

      <div className="flex items-start gap-4">
        <aside className="panel flex w-[124px] flex-col gap-4 p-3">
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

        <div className="relative">
          <canvas
            ref={boardRef}
            className="block rounded-md border border-slate-700/70 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
          />
          {overlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-md bg-slate-950/80 backdrop-blur-sm">
              <p className="neon-title text-3xl">
                {hud.status === "over" ? "GAME OVER" : "PAUSED"}
              </p>
              {hud.status === "over" && (
                <p className="value text-center">
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

        <aside className="panel flex w-[124px] flex-col gap-3 p-3">
          <div>
            <p className="label">NEXT</p>
            <canvas ref={nextRef} className="mt-1 block" />
          </div>
        </aside>
      </div>

      <div className="flex max-w-[520px] flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] tracking-wide text-slate-400">
        <span>← → move</span>
        <span>↓ soft drop</span>
        <span>↑ / X rotate</span>
        <span>Z ccw</span>
        <span>Space hard drop</span>
        <span>C / Shift hold</span>
        <span>P pause</span>
        <span>R restart</span>
      </div>
    </main>
  );
}