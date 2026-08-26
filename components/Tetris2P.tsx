"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getPusherClient } from "@/lib/pusher-client";
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
  calcGarbage,
  receiveGarbage,
  getBoardState,
  setBoardState,
  PREVIEW_COUNT,
  type GameState,
  type PieceType,
  type Status,
  type Board,
  type Cell,
} from "@/lib/tetris";

const CELL = 28;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const PREVIEW_CELL = 18;
const SYNC_INTERVAL = 100;

function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number, responsive = false) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (responsive) {
    canvas.style.width = `min(${w}px, 100vw - 1rem)`;
    canvas.style.height = "auto";
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
  if (ghost) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(px, py, size, size * 0.4);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: number[][],
  ox: number,
  oy: number,
  type: PieceType,
  cellSize: number,
  ghost = false,
) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      drawBlock(ctx, ox + c * cellSize, oy + r * cellSize, cellSize, COLORS[type], ghost);
    }
  }
}

function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: PieceType,
  cellSize: number,
) {
  const shape = SHAPES[type];
  const cols = shape[0].length;
  const rows = shape.length;
  const ox = (cellSize * 4 - cols * cellSize) / 2;
  const oy = (cellSize * 2 - rows * cellSize) / 2;
  drawShape(ctx, shape, ox, oy, type, cellSize);
}

function drawOpponentBoard(
  ctx: CanvasRenderingContext2D,
  board: (string | number)[][],
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, w, h);

  const cellW = w / COLS;
  const cellH = h / ROWS;

  for (let r = 0; r < ROWS; r++) {
    if (!board[r]) continue;
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (!cell || cell === 0) continue;
      const color = COLORS[cell as Cell] ?? "#94a3b8";
      ctx.fillStyle = color;
      ctx.fillRect(c * cellW, r * cellH, cellW - 0.5, cellH - 0.5);
    }
  }
}

interface Hud {
  score: number;
  lines: number;
  level: number;
  status: Status;
}

interface OpponentPiece {
  type: PieceType;
  shape: number[][];
  x: number;
  y: number;
  timestamp: number;
  level: number;
}

interface OpponentState {
  board: (string | number)[][];
  score: number;
  lines: number;
  level: number;
  status: Status;
  garbage: number;
}

type Phase = "lobby" | "waiting" | "playing";

export default function Tetris2P() {
  const boardRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const oppBoardRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initGame());
  const rafRef = useRef<number>(0);
  const prevHud = useRef<Hud>({ score: 0, lines: 0, level: 1, status: "playing" });
  const timersRef = useRef<Map<string, { t: number; i: number }>>(new Map());

  const [phase, setPhase] = useState<Phase>("lobby");
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [role, setRole] = useState<"host" | "guest" | null>(null);
  const [opponentName, setOpponentName] = useState("");
  const [error, setError] = useState("");
  const [hud, setHud] = useState<Hud>({
    score: 0,
    lines: 0,
    level: 1,
    status: "playing",
  });
  const [opp, setOpp] = useState<OpponentState>({
    board: [],
    score: 0,
    lines: 0,
    level: 1,
    status: "playing",
    garbage: 0,
  });
  const oppRef = useRef<OpponentState>(opp);
  const oppPieceRef = useRef<OpponentPiece | null>(null);

  const dropSoundRef = useRef<HTMLAudioElement | null>(null);
  const unevenSoundRef = useRef<HTMLAudioElement | null>(null);
  const clearSoundRef = useRef<HTMLAudioElement | null>(null);
  const clearPlayedRef = useRef(false);
  const pendingGarbageRef = useRef(0);
  const appliedGarbageRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const playClearSound = () => {
    if (!clearSoundRef.current) {
      clearSoundRef.current = new Audio("/sounds/malupiton-boss-2.mp3");
    }
    const audio = clearSoundRef.current;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };

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
      clearInterval(entry.i);
      clearTimeout(entry.t);
      map.delete(code);
    }
  };

  const startRepeat = (code: string, fn: () => void) => {
    stopRepeat(code);
    const t = window.setTimeout(() => {
      const i = window.setInterval(fn, 45);
      timersRef.current.set(code, { t: 0, i });
    }, 170);
    timersRef.current.set(code, { t, i: 0 });
  };

  const syncToServer = useCallback(async () => {
    if (!roomCode || !role) return;
    const s = stateRef.current;
    const garbageToSend = pendingGarbageRef.current;
    if (garbageToSend > 0) pendingGarbageRef.current = 0;
    const boardToSend = getBoardState(s.board);
    const pieceToSend = s.current && s.status === "playing" && !s.clearing
      ? { type: s.current.type, shape: s.current.shape, x: s.current.x, y: s.current.y }
      : null;
    try {
      const res = await fetch(`/api/sync/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          board: boardToSend,
          piece: pieceToSend,
          score: s.score,
          lines: s.lines,
          level: s.level,
          status: s.status,
          garbage: garbageToSend,
        }),
      });
      const data = await res.json();
      if (data.state) {
        const st = data.state;
        const isHost = role === "host";
        const oppBoard = isHost ? st.guest_board : st.host_board;
        const oppScore = isHost ? st.guest_score : st.host_score;
        const oppLines = isHost ? st.guest_lines : st.host_lines;
        const oppLevel = isHost ? st.guest_level : st.host_level;
        const oppStatus = isHost ? st.guest_status : st.host_status;
        const myGarbage = isHost ? st.host_garbage : st.guest_garbage;

        setOpp({
          board: oppBoard || [],
          score: oppScore || 0,
          lines: oppLines || 0,
          level: oppLevel || 1,
          status: oppStatus || "playing",
          garbage: 0,
        });

        if (myGarbage > appliedGarbageRef.current) {
          const delta = myGarbage - appliedGarbageRef.current;
          receiveGarbage(s.board, delta);
          appliedGarbageRef.current = myGarbage;
          await fetch(`/api/garbage/${roomCode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, clear: myGarbage }),
          });
        } else if (myGarbage < appliedGarbageRef.current) {
          appliedGarbageRef.current = myGarbage;
        }
      }
    } catch {}
  }, [roomCode, role]);

  const applyOpponentState = useCallback((st: Record<string, unknown>) => {
    const isHost = role === "host";
    const oppBoard = isHost ? st.guest_board : st.host_board;
    const oppScore = isHost ? st.guest_score : st.host_score;
    const oppLines = isHost ? st.guest_lines : st.host_lines;
    const oppLevel = isHost ? st.guest_level : st.host_level;
    const oppStatus = isHost ? st.guest_status : st.host_status;

    const next = {
      board: (oppBoard as (string | number)[][]) || [],
      score: (oppScore as number) || 0,
      lines: (oppLines as number) || 0,
      level: (oppLevel as number) || 1,
      status: (oppStatus as string as Status) || "playing",
      garbage: 0,
    };
    oppRef.current = next;
    setOpp(next);
  }, [role]);

  const waitForOpponent = useCallback(async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/sync/${roomCode}`);
      const data = await res.json();
      if (data.room?.status === "playing") {
        setOpponentName(data.room.guest_name || "Player 2");
        setPhase("playing");
        return true;
      }
    } catch {}
    return false;
  }, [roomCode]);

  const createRoom = async () => {
    if (!playerName.trim()) {
      setError("Enter your name");
      return;
    }
    setError("");
    const playerId = crypto.randomUUID();
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName.trim(), playerId }),
      });
      const data = await res.json();
      if (data.code) {
        setRoomCode(data.code);
        setRole("host");
        setPhase("waiting");
      }
    } catch {
      setError("Failed to create room");
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !joinCode.trim()) {
      setError("Enter your name and room code");
      return;
    }
    setError("");
    const playerId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/rooms/${joinCode.trim().toUpperCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName.trim(), playerId }),
      });
      const data = await res.json();
      if (data.code) {
        setRoomCode(data.code);
        setRole("guest");
        setOpponentName("Player 1");
        setPhase("playing");
      } else {
        setError(data.error || "Failed to join room");
      }
    } catch {
      setError("Failed to join room");
    }
  };

  const restart = () => {
    stateRef.current = initGame();
    clearPlayedRef.current = false;
    pendingGarbageRef.current = 0;
    appliedGarbageRef.current = 0;
    syncHud();
  };

  useEffect(() => {
    if (phase === "waiting") {
      const interval = setInterval(async () => {
        const found = await waitForOpponent();
        if (found) clearInterval(interval);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [phase, waitForOpponent]);

  useEffect(() => {
    if (phase !== "playing") return;

    const boardCanvas = boardRef.current;
    const holdCanvas = holdRef.current;
    const nextCanvas = nextRef.current;
    const oppCanvas = oppBoardRef.current;
    if (!boardCanvas || !holdCanvas || !nextCanvas || !oppCanvas) return;

    const boardCtx = fitCanvas(boardCanvas, BOARD_W, BOARD_H, true);
    const holdCtx = fitCanvas(holdCanvas, 100, 70);
    const nextCtx = fitCanvas(nextCanvas, 100, 160);
    const oppCtx = fitCanvas(oppCanvas, BOARD_W, BOARD_H, true);

    let last = 0;
    let acc = 0;

    syncTimerRef.current = setInterval(syncToServer, SYNC_INTERVAL);

    fetch(`/api/sync/${roomCode}`)
      .then((r) => r.json())
      .then((data) => { if (data.state) applyOpponentState(data.state); })
      .catch(() => {});

    const pusher = getPusherClient();
    pusher.connection.bind("state_change", (state: { current: string }) => {
      if (state.current === "failed") {
        pusher.connect();
      }
    });
    const channel = pusher.subscribe(`game-${roomCode}`);
    channel.bind("state-update", (data: { state: Record<string, unknown> }) => {
      if (data.state) applyOpponentState(data.state);
    });
    channel.bind("piece-update", (data: { role: string; piece: { type: PieceType; shape: number[][]; x: number; y: number } | null }) => {
      if (data.role !== role) {
        if (data.piece) {
          oppPieceRef.current = {
            ...data.piece,
            timestamp: performance.now(),
            level: oppRef.current.level || 1,
          };
        } else {
          oppPieceRef.current = null;
        }
      }
    });
    channel.bind("pusher:subscription_error", () => {});

    fallbackPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sync/${roomCode}`);
        const data = await res.json();
        if (data.state) applyOpponentState(data.state);
      } catch {}
    }, 500);

    const render = () => {
      const s = stateRef.current;

      boardCtx.clearRect(0, 0, BOARD_W, BOARD_H);
      boardCtx.fillStyle = "#05070f";
      boardCtx.fillRect(0, 0, BOARD_W, BOARD_H);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = s.board[r][c];
          if (!cell) continue;
          drawBlock(boardCtx, c * CELL, r * CELL, CELL, COLORS[cell] ?? "#94a3b8");
        }
      }

      if (s.status === "playing") {
        if (s.clearing) {
          if (!clearPlayedRef.current) {
            clearPlayedRef.current = true;
            playClearSound();
          }
          const progress = 1 - s.clearing.remaining / CLEAR_ANIMATION_MS;
          const pulse = 0.35 + 0.4 * Math.sin(progress * Math.PI * 5);
          boardCtx.save();
          for (const row of s.clearing.rows) {
            boardCtx.fillStyle = `rgba(255,255,255,${pulse.toFixed(3)})`;
            boardCtx.shadowColor = "#ffffff";
            boardCtx.shadowBlur = 18;
            boardCtx.beginPath();
            boardCtx.roundRect(
              1.5,
              row * CELL + 1.5,
              BOARD_W - 3,
              CELL - 3,
              4,
            );
            boardCtx.fill();
          }
          boardCtx.restore();
        } else {
          const gy = ghostY(s.board, s.current.shape, s.current.x, s.current.y);
          drawShape(boardCtx, s.current.shape, s.current.x * CELL, gy * CELL, s.current.type, CELL, true);
          drawShape(boardCtx, s.current.shape, s.current.x * CELL, s.current.y * CELL, s.current.type, CELL);
        }
      }

      holdCtx.clearRect(0, 0, 100, 70);
      if (s.hold) drawMiniPiece(holdCtx, s.hold, PREVIEW_CELL);

      nextCtx.clearRect(0, 0, 100, 160);
      const count = Math.min(PREVIEW_COUNT, s.queue.length);
      const slotH = 160 / count;
      for (let i = 0; i < count; i++) {
        const type = s.queue[i];
        const shape = SHAPES[type];
        const cols = shape[0].length;
        const rows = shape.length;
        const ox = (100 - cols * PREVIEW_CELL) / 2;
        const oy = i * slotH + (slotH - rows * PREVIEW_CELL) / 2;
        drawShape(nextCtx, shape, ox, oy, type, PREVIEW_CELL);
      }

      drawOpponentBoard(oppCtx, oppRef.current.board, BOARD_W, BOARD_H);

      const oppPiece = oppPieceRef.current;
      if (oppPiece) {
        drawShape(oppCtx, oppPiece.shape, oppPiece.x * CELL, oppPiece.y * CELL, oppPiece.type, CELL, true);
        drawShape(oppCtx, oppPiece.shape, oppPiece.x * CELL, oppPiece.y * CELL, oppPiece.type, CELL);
      }

      syncHud();
    };

    const loop = (now: number) => {
      if (!last) last = now;
      const dt = Math.min(now - last, 100);
      last = now;
      const s = stateRef.current;

      if (s.status === "playing") {
        if (s.clearing) {
          s.clearing.remaining -= dt;
          if (s.clearing.remaining <= 0) {
            const cleared = finalizeClear(s);
            clearPlayedRef.current = false;
            const garbage = calcGarbage(cleared);
            if (garbage > 0) {
              pendingGarbageRef.current += garbage;
            }
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
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (fallbackPollRef.current) clearInterval(fallbackPollRef.current);
      channel.unbind_all();
      pusher.unsubscribe(`game-${roomCode}`);
    };
  }, [phase, roomCode, role, syncToServer, applyOpponentState]);

  useEffect(() => {
    if (phase !== "playing") return;

    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const playing = s.status === "playing";

      switch (e.code) {
        case "ArrowLeft":
          e.preventDefault();
          if (playing) { moveLeft(s); startRepeat("ArrowLeft", () => moveLeft(stateRef.current)); }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (playing) { moveRight(s); startRepeat("ArrowRight", () => moveRight(stateRef.current)); }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (playing) { softDrop(s); startRepeat("ArrowDown", () => softDrop(stateRef.current)); }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (playing && !e.repeat) rotate(s, 1);
          break;
        case "Period":
          if (playing && !e.repeat) rotate(s, -1);
          break;
        case "Space":
          e.preventDefault();
          if (playing && !e.repeat) { hardDrop(s); playDropSound(); }
          break;
        case "ShiftLeft":
        case "ShiftRight":
        case "Slash":
        case "KeyC":
          if (playing && !e.repeat) holdPiece(s);
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => stopRepeat(e.code);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      timersRef.current.forEach((entry) => {
        clearTimeout(entry.t);
        clearInterval(entry.i);
      });
      timersRef.current.clear();
    };
  }, [phase, role]);

  const overlay = hud.status !== "playing";
  const oppDead = opp.status === "over";
  const iDead = hud.status === "over";
  const winner = iDead ? false : oppDead ? true : null;

  if (phase === "lobby") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <h2 className="neon-title text-2xl tracking-[0.2em]">2P ONLINE</h2>
        <input
          type="text"
          placeholder="Your name"
          maxLength={16}
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-60 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm text-slate-200 outline-none focus:border-cyan-500"
        />
        <div className="flex gap-4">
          <button className="neon-btn" onClick={createRoom}>
            Create Room
          </button>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Room code"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-24 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm uppercase tracking-widest text-slate-200 outline-none focus:border-cyan-500"
            />
            <button className="neon-btn" onClick={joinRoom}>
              Join
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <h2 className="neon-title text-2xl tracking-[0.2em]">WAITING FOR OPPONENT</h2>
        <div className="panel flex flex-col items-center gap-3 p-6">
          <p className="label">ROOM CODE</p>
          <p className="neon-title text-4xl tracking-[0.4em]">{roomCode}</p>
          <p className="text-xs text-slate-400">Share this code with your opponent</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Searching for opponent...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center gap-3 p-2 sm:gap-4 sm:p-4">
      {winner !== null && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-950/85 backdrop-blur-sm">
          <p className={`neon-title text-3xl sm:text-4xl ${winner ? "" : "text-rose-400"}`}>
            {winner ? "YOU WIN!" : "YOU LOSE"}
          </p>
          <div className="flex gap-4">
            <button className="neon-btn" onClick={restart}>
              Play Again
            </button>
          </div>
        </div>
      )}

      <div className="flex w-full max-w-[700px] items-center justify-between text-xs">
        <div className={`panel px-2 py-1 sm:px-3 ${role === "host" ? "ring-1 ring-cyan-400" : "ring-1 ring-rose-400"}`}>
          <span className="label mr-1">{playerName}</span>
          <span className="value text-xs">{hud.score}</span>
        </div>
        <div className="text-[10px] text-slate-500">
          Room: {roomCode}
        </div>
        <div className={`panel px-2 py-1 sm:px-3 ${role === "guest" ? "ring-1 ring-cyan-400" : "ring-1 ring-rose-400"}`}>
          <span className="label mr-1">{opponentName}</span>
          <span className="value text-xs">{opp.score}</span>
        </div>
      </div>

      <div className="flex items-start justify-center gap-4">
        <aside className="panel hidden w-[100px] flex-col gap-3 p-2 sm:flex">
          <div>
            <p className="label">HOLD</p>
            <canvas ref={holdRef} className="mt-1 block" />
          </div>
          <div className="h-px bg-slate-700/60" />
          <div>
            <p className="label">NEXT</p>
            <canvas ref={nextRef} className="mt-1 block" />
          </div>
          <div className="h-px bg-slate-700/60" />
          <div>
            <p className="label">SCORE</p>
            <p className="value text-xs">{hud.score.toLocaleString()}</p>
          </div>
          <div>
            <p className="label">LEVEL</p>
            <p className="value text-xs">{hud.level.toLocaleString()}</p>
          </div>
          <div>
            <p className="label">LINES</p>
            <p className="value text-xs">{hud.lines.toLocaleString()}</p>
          </div>
        </aside>

        <div className="relative w-full max-w-[320px]">
          <p className="label mb-1 text-center text-[10px]">{playerName}</p>
          <canvas
            ref={boardRef}
            className="block w-full rounded-md border border-slate-700/70 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
          />
        </div>

        <div className="relative w-full max-w-[320px]">
          <p className="label mb-1 text-center text-[10px]">{opponentName || "Opponent"}</p>
          <canvas
            ref={oppBoardRef}
            className="block w-full rounded-md border border-slate-700/70 shadow-[0_0_40px_rgba(244,63,94,0.15)]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>Lv.{opp.level}</span>
            <span>{opp.lines}L</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-500">
        ← → ↓ move · ↑ rotate · . ccw · Space drop · Shift/C hold
      </p>
    </div>
  );
}
