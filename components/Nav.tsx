"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Tetris" },
  { href: "/scorched-earth", label: "Scorched Earth" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="nav-bar">
      <Link href="/" className="nav-brand neon-title text-lg tracking-[0.2em]">
        ARCADE
      </Link>
      <nav className="flex gap-1">
        {links.map((l) => {
          const active =
            l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link ${active ? "active" : ""}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}