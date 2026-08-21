import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 sm:gap-8 sm:p-8">
      <h1 className="neon-title text-4xl tracking-[0.3em] sm:text-5xl">ARCADE</h1>
      <p className="text-center text-sm text-slate-400">
        Classic games with a retro neon twist.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <Link href="/tetris" className="game-card">
          <span className="neon-title text-xl tracking-[0.15em] sm:text-2xl">TETRIS</span>
          <span className="text-xs text-slate-400 sm:text-sm">Stack and clear</span>
        </Link>
        <Link href="/scorched-earth" className="game-card">
          <span className="neon-title text-xl tracking-[0.15em] sm:text-2xl">
            SCORCHED EARTH
          </span>
          <span className="text-xs text-slate-400 sm:text-sm">Artillery warfare</span>
        </Link>
      </div>
    </div>
  );
}