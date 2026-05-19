"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AkmilLogo } from "./AkmilLogo";

const TABS = [
  { href: "/lobby", label: "Lobby" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
] as const;

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-13">
        <div className="py-2">
          <AkmilLogo size="sm" />
        </div>
        <div className="flex h-full">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 flex items-center text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                  active
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
