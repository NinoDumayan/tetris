"use client";

import { useState } from "react";
import Tetris from "@/components/Tetris";
import Tetris2P from "@/components/Tetris2P";

export default function TetrisPage() {
  const [mode, setMode] = useState<"1p" | "2p" | null>(null);

  if (mode === "1p") return <Tetris />;
  if (mode === "2p") return <Tetris2P />;

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