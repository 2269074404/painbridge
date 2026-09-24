"use client";

import { Calendar, Check, CircleDashed, Home, LifeBuoy, MapPin, Pill, Sparkles, Wallet, X } from "lucide-react";
import type { Eligibility, Match, Trial } from "@/lib/types";
import { EligibilityBadge, ScoreRing } from "./ui";

export default function TrialCard({
  trial,
  eligibility,
  match,
  matchLoading,
  compact,
}: {
  trial: Trial;
  eligibility: Eligibility;
  match: Match | null;
  matchLoading?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">{trial.protocolId}</span>
            <span>·</span>
            <span>{trial.phase}</span>
            <span>·</span>
            <span>{trial.interventionType}</span>
          </div>
          <h2 className="mt-1 text-xl font-semibold leading-snug">{trial.shortTitle}</h2>
          <div className="mt-2">
            <EligibilityBadge status={eligibility.status} />
          </div>
        </div>
        {match ? (
          <div className="text-center">
            <ScoreRing score={match.score} />
            <div className="mt-1 text-[10px] text-slate-500 inline-flex items-center gap-0.5">
              {match.source === "ai" && <Sparkles className="size-3" aria-hidden />}
              fit score
            </div>
          </div>
        ) : (
          matchLoading && <div className="size-14 rounded-full bg-slate-100 animate-pulse" aria-label="Scoring fit" />
        )}
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">{trial.summary}</p>

      {match && (
        <div className="rounded-lg bg-brand-50 p-3">
          <p className="text-sm text-brand-700 font-medium">{match.summary}</p>
          <ul className="mt-2 space-y-1">
            {match.reasons.map((r) => (
              <li key={r} className="text-sm text-slate-700 flex gap-2">
                <Check className="size-4 text-brand-600 shrink-0 mt-0.5" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {match && match.barriers.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
            <LifeBuoy className="size-3.5" aria-hidden /> Things to plan for, and the help available
          </div>
          <ul className="space-y-1">
            {match.barriers.map((b) => (
              <li key={b} className="text-sm text-slate-700">
                · {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Fact Icon={Calendar} label="Length" value={`${trial.durationWeeks} weeks · ${trial.visits} visits`} />
        <Fact Icon={Home} label="Remote" value={trial.fullyRemote ? "Fully remote" : trial.remoteVisits ? "Some visits" : "In person"} />
        <Fact Icon={Pill} label="Placebo" value={trial.placebo ? "Possible" : "No placebo"} />
        <Fact Icon={Wallet} label="Compensation" value={trial.compensation || "Ask"} />
      </div>

      <div className="text-sm text-slate-600 flex items-start gap-1.5">
        <MapPin className="size-4 shrink-0 mt-0.5 text-slate-400" aria-hidden />
        {eligibility.nearestSite ? (
          <span>
            Nearest site: {eligibility.nearestSite}, {eligibility.nearestSiteCity}
            {eligibility.distanceMiles !== null && <> ({Math.round(eligibility.distanceMiles)} mi)</>}
            {trial.travelSupport && " · travel reimbursed"}
          </span>
        ) : (
          <span>Site information unavailable</span>
        )}
      </div>

      {!compact && (
        <>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Pre-screen checklist</div>
            <ul className="space-y-1 text-sm">
              {eligibility.met.map((c) => (
                <li key={c} className="flex gap-2 text-slate-700">
                  <Check className="size-4 shrink-0 mt-0.5" style={{ color: "var(--status-good)" }} aria-label="Met" />
                  {c}
                </li>
              ))}
              {eligibility.unmet.map((c) => (
                <li key={c} className="flex gap-2 text-slate-700">
                  <X className="size-4 shrink-0 mt-0.5" style={{ color: "var(--status-critical)" }} aria-label="Not met" />
                  {c}
                </li>
              ))}
              {eligibility.toConfirm.map((c) => (
                <li key={c} className="flex gap-2 text-slate-500">
                  <CircleDashed className="size-4 shrink-0 mt-0.5" aria-label="Confirmed at screening" />
                  {c} <span className="text-xs">(study team confirms)</span>
                </li>
              ))}
            </ul>
          </div>
          {trial.whatToExpect.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">What to expect</div>
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-0.5">
                {trial.whatToExpect.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-400">
            {trial.sponsor} · {trial.title}
          </p>
        </>
      )}
    </div>
  );
}

function Fact({ Icon, label, value }: { Icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5">
      <div className="text-[11px] text-slate-500 flex items-center gap-1">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="font-medium text-slate-800 mt-0.5 text-[13px]">{value}</div>
    </div>
  );
}
