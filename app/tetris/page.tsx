"use client";

import { useState } from "react";
import Tetris from "@/components/Tetris";
import Tetris2P from "@/components/Tetris2P";

type GameMode = "marathon" | "sprint" | "death" | "cheese";

export default function TetrisPage() {
  const [mode, setMode] = useState<"1p" | "2p" | null>(null);
  const [gameMode, setGameMode] = useState<GameMode | null>(null);

  if (mode === "2p" || (mode === "1p" && gameMode)) {
    return <Tetris mode={mode === "2p" ? "marathon" : gameMode!} onBack={() => { setMode(null); setGameMode(null); }} />;
  }

  if (mode === "1p") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <h1 className="neon-title text-3xl tracking-[0.3em] sm:text-4xl">TETRIS</h1>
        <p className="text-sm text-slate-400">Select game mode</p>
        <div className="flex flex-col gap-3">
          <button className="neon-btn" onClick={() => setGameMode("marathon")}>
            MARATHON — Endless, speed increases
          </button>
          <button className="neon-btn" onClick={() => setGameMode("sprint")}>
            SPRINT — Clear 40 lines fastest
          </button>
          <button className="neon-btn" onClick={() => setGameMode("death")}>
            DEATH — Garbage rises, survive
          </button>
          <button className="neon-btn" onClick={() => setGameMode("cheese")}>
            CHEESE — Clear all garbage to win
          </button>
        </div>
        <button className="neon-btn ghost text-sm" onClick={() => setMode(null)}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <h1 className="neon-title text-3xl tracking-[0.3em] sm:text-4xl">TETRIS</h1>
      <p className="text-sm text-slate-400">Select game mode</p>
      <div className="flex gap-4">
        <button className="neon-btn" onClick={() => setMode("1p")}>
          1 Player
        </button>
        <button className="neon-btn" onClick={() => setMode("2p")}>
          2 Player Online
        </button>
      </div>
    </div>
  );
}
