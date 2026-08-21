import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <h1 className="neon-title text-5xl tracking-[0.3em]">ARCADE</h1>
      <p className="text-center text-slate-400">
        Classic games with a retro neon twist.
      </p>
      <div className="flex gap-6">
        <Link href="/tetris" className="game-card">
          <span className="neon-title text-2xl tracking-[0.15em]">TETRIS</span>
          <span className="text-sm text-slate-400">Stack and clear</span>
        </Link>
        <Link href="/scorched-earth" className="game-card">
          <span className="neon-title text-2xl tracking-[0.15em]">
            SCORCHED EARTH
          </span>
          <span className="text-sm text-slate-400">Artillery warfare</span>
        </Link>
      </div>
    </div>
  );
}