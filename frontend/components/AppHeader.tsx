"use client";

import { LogOut } from "lucide-react";
import BrandMark from "./BrandMark";
import { Button, cx } from "./ui";
import type { User } from "@/lib/types";

export type Tab = { key: string; label: string; icon?: React.ReactNode };

export default function AppHeader({
  user,
  tabs,
  active,
  onTab,
  onHome,
  onSignOut,
}: {
  user: User | null;
  tabs?: Tab[];
  active?: string;
  onTab?: (k: string) => void;
  onHome: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
        <button onClick={onHome} className="flex items-center gap-2 font-semibold text-slate-900">
          <BrandMark />
          <span className={tabs ? "hidden sm:inline" : undefined}>PainBridge</span>
        </button>
        {tabs && (
          <nav className="flex-1 flex gap-1 overflow-x-auto" aria-label="Sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onTab?.(t.key)}
                aria-current={active === t.key ? "page" : undefined}
                className={cx(
                  "whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm",
                  active === t.key ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        )}
        {!tabs && <div className="flex-1" />}
        {user && (
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-xs text-slate-500">{user.legalName}</span>
            <Button variant="ghost" size="sm" onClick={onSignOut} aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
