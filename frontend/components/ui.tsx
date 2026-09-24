"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react";
import type { Eligibility } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700",
        variant === "secondary" && "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
        className
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-xl bg-white ring-1 ring-slate-200 shadow-sm", className)}>{children}</div>;
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "rounded-full px-3 py-1.5 text-sm ring-1 transition-colors",
        selected ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:ring-brand-500"
      )}
    >
      {children}
    </button>
  );
}

export function MultiChips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o} selected={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

export function SingleChips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T | ""; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o} selected={value === o} onClick={() => onChange(o)}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function Scale({
  value,
  onChange,
  min = 0,
  max = 10,
  low,
  high,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  low?: string;
  high?: string;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  return (
    <div>
      <div className="flex gap-1 flex-wrap">
        {nums.map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={cx(
              "size-9 rounded-md text-sm tabular-nums ring-1 transition-colors",
              value === n ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-300 hover:ring-brand-500"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {(low || high) && (
        <div className="flex justify-between text-[11px] text-slate-500 mt-1 max-w-[440px]">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
    </div>
  );
}

const ELIG = {
  likely: { label: "Likely eligible", Icon: CheckCircle2, cls: "bg-green-50 text-green-800 ring-green-200" },
  possible: { label: "Eligible, travel to plan", Icon: HelpCircle, cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  unlikely: { label: "May not qualify", Icon: XCircle, cls: "bg-slate-100 text-slate-700 ring-slate-300" },
} as const;

export function EligibilityBadge({ status }: { status: Eligibility["status"] }) {
  const { label, Icon, cls } = ELIG[status];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", cls)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Fit score ${score} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">{score}</div>
    </div>
  );
}

export function RiskBadge({ level }: { level: "Low" | "Medium" | "High" }) {
  const map = {
    Low: { color: "var(--status-good)", Icon: CheckCircle2 },
    Medium: { color: "var(--status-warning)", Icon: AlertTriangle },
    High: { color: "var(--status-critical)", Icon: AlertTriangle },
  } as const;
  const { color, Icon } = map[level];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-700">
      <Icon className="size-3.5" style={{ color }} aria-hidden />
      {level}
    </span>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-md text-sm text-slate-700">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label ?? "Loading…"}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-red-50 text-red-800 text-sm px-3 py-2 ring-1 ring-red-200">{children}</div>;
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cx("w-full rounded-2xl bg-white shadow-xl my-8", wide ? "max-w-4xl" : "max-w-md")}
      >
        {children}
      </div>
    </div>
  );
}

export function fmtDate(iso?: string | null, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
