"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, FlaskConical, Inbox, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta, Overview, ReferralRow, Trial, User } from "@/lib/types";
import AddTrial from "./AddTrial";
import AppHeader from "./AppHeader";
import ReferralDetail from "./ReferralDetail";
import { Button, Card, EligibilityBadge, ErrorNote, RiskBadge, SectionTitle, Spinner, cx, fmtDate, inputCls } from "./ui";

type TabKey = "pipeline" | "overview" | "studies";
const TABS = [
  { key: "pipeline", label: "Referrals", icon: <Inbox className="size-4" /> },
  { key: "overview", label: "Overview", icon: <BarChart3 className="size-4" /> },
  { key: "studies", label: "Studies", icon: <FlaskConical className="size-4" /> },
];

export default function CoordinatorApp({ user, meta, onHome, onSignOut }: { user: User; meta: Meta; onHome: () => void; onSignOut: () => void }) {
  const [tab, setTab] = useState<TabKey>("pipeline");
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ReferralRow[]>("/api/v1/coordinator/referrals").then(setRows).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="min-h-screen">
      <AppHeader user={user} tabs={TABS} active={tab} onTab={(k) => setTab(k as TabKey)} onHome={onHome} onSignOut={onSignOut} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {err && <ErrorNote>{err}</ErrorNote>}
        {tab === "pipeline" && (rows ? <Pipeline rows={rows} meta={meta} onOpen={setOpenId} /> : <Spinner />)}
        {tab === "overview" && <OverviewTab />}
        {tab === "studies" && <StudiesTab meta={meta} />}
      </main>
      {openId && <ReferralDetail id={openId} meta={meta} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  New: "bg-blue-50 text-blue-800 ring-blue-200",
  "Pre-screening": "bg-slate-100 text-slate-700 ring-slate-300",
  Contacted: "bg-slate-100 text-slate-700 ring-slate-300",
  "Screening visit scheduled": "bg-amber-50 text-amber-800 ring-amber-200",
  Enrolled: "bg-green-50 text-green-800 ring-green-200",
  "Screen fail": "bg-slate-50 text-slate-500 ring-slate-200",
  Withdrawn: "bg-slate-50 text-slate-500 ring-slate-200",
};

function Pipeline({ rows, meta, onOpen }: { rows: ReferralRow[]; meta: Meta; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState("Active");
  const [trial, setTrial] = useState("All");
  const trials = useMemo(() => Array.from(new Set(rows.map((r) => r.trial.shortTitle))), [rows]);
  const filtered = rows.filter(
    (r) =>
      (trial === "All" || r.trial.shortTitle === trial) &&
      (status === "All" || (status === "Active" ? !["Screen fail", "Withdrawn"].includes(r.status) : r.status === status))
  );
  const newCount = rows.filter((r) => r.status === "New").length;
  const atRisk = rows.filter((r) => r.status === "Enrolled" && r.diary?.retentionRisk === "High").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle hint={`${newCount} new referral(s) awaiting first contact · ${atRisk} enrolled participant(s) at high retention risk`}>Referral pipeline</SectionTitle>
        <div className="flex gap-2">
          <select className={cx(inputCls, "w-auto")} value={trial} onChange={(e) => setTrial(e.target.value)} aria-label="Filter by study">
            <option>All</option>
            {trials.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className={cx(inputCls, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option>Active</option>
            <option>All</option>
            {meta.referralStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="font-medium px-4 py-2.5">Patient</th>
              <th className="font-medium px-4 py-2.5">Study</th>
              <th className="font-medium px-4 py-2.5">Pre-screen</th>
              <th className="font-medium px-4 py-2.5 text-right">Fit</th>
              <th className="font-medium px-4 py-2.5">Status</th>
              <th className="font-medium px-4 py-2.5">Diary</th>
              <th className="font-medium px-4 py-2.5">Referred</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(r.id)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold grid place-items-center">{r.patient.initials}</div>
                    <div>
                      <div className="text-slate-900">
                        {r.patient.age} · {r.patient.sex}
                      </div>
                      <div className="text-xs text-slate-500">{r.patient.city}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-900">{r.trial.shortTitle}</div>
                  <div className="text-xs text-slate-500">{r.patient.primaryCondition}</div>
                </td>
                <td className="px-4 py-3">
                  <EligibilityBadge status={r.eligibilityStatus} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{r.matchScore}</td>
                <td className="px-4 py-3">
                  <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs ring-1 whitespace-nowrap", STATUS_TONE[r.status])}>{r.status}</span>
                  {r.screeningVisitAt && r.status === "Screening visit scheduled" && <div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(r.screeningVisitAt, true)}</div>}
                </td>
                <td className="px-4 py-3">{r.diary && r.diary.entries > 0 ? <RiskBadge level={r.diary.retentionRisk} /> : <span className="text-xs text-slate-400">No entries</span>}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No referrals match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function OverviewTab() {
  const [ov, setOv] = useState<Overview | null>(null);
  useEffect(() => {
    api<Overview>("/api/v1/coordinator/overview").then(setOv);
  }, []);
  if (!ov) return <Spinner />;
  const stages = ["New", "Pre-screening", "Contacted", "Screening visit scheduled", "Enrolled", "Screen fail"];

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle hint="Enrollment toward target (all sources) and this platform's referral funnel per study.">Enrollment</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="font-medium px-4 py-2.5">Study</th>
                <th className="font-medium px-4 py-2.5 w-64">Enrolled / target</th>
                {stages.map((s) => (
                  <th key={s} className="font-medium px-2 py-2.5 text-right whitespace-nowrap">
                    {s === "Screening visit scheduled" ? "Screening" : s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {ov.funnel.map((f) => {
                const pct = Math.min(100, (f.enrolled / Math.max(1, f.target)) * 100);
                return (
                  <tr key={f.trialId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{f.shortTitle}</div>
                      <div className="text-xs text-slate-500 font-mono">{f.protocolId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100" role="meter" aria-valuenow={f.enrolled} aria-valuemax={f.target} aria-label="Enrollment">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--viz-series-1)" }} />
                        </div>
                        <span className="text-xs text-slate-600 w-16 text-right">
                          {f.enrolled}/{f.target}
                        </span>
                      </div>
                    </td>
                    {stages.map((s) => (
                      <td key={s} className={cx("px-2 py-3 text-right", f.counts[s] ? "text-slate-900" : "text-slate-300")}>
                        {f.counts[s] ?? 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <SectionTitle hint="Share of each group among referred vs. enrolled participants. A large drop suggests a barrier worth addressing (visit times, travel support, interpreter access).">
          Representation: referred vs. enrolled
        </SectionTitle>
        <div className="grid md:grid-cols-3 gap-4">
          {(
            [
              ["sex", "Sex"],
              ["age", "Age"],
              ["travel", "Travel radius"],
            ] as const
          ).map(([k, label]) => (
            <RepresentationCard key={k} title={label} data={ov.representation[k]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RepresentationCard({ title, data }: { title: string; data: { referred: Record<string, number>; enrolled: Record<string, number> } }) {
  const groups = Array.from(new Set([...Object.keys(data.referred), ...Object.keys(data.enrolled)])).sort();
  const tot = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0) || 1;
  const tr = tot(data.referred);
  const te = tot(data.enrolled);
  return (
    <Card className="p-4">
      <div className="font-medium text-sm mb-2">{title}</div>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left font-medium pb-1">Group</th>
            <th className="text-right font-medium pb-1">Referred (n={Object.values(data.referred).reduce((a, b) => a + b, 0)})</th>
            <th className="text-right font-medium pb-1">Enrolled (n={Object.values(data.enrolled).reduce((a, b) => a + b, 0)})</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const r = ((data.referred[g] ?? 0) / tr) * 100;
            const e = ((data.enrolled[g] ?? 0) / te) * 100;
            const drop = r - e >= 15;
            return (
              <tr key={g} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-700">{g}</td>
                <td className="py-1.5 text-right">{Math.round(r)}%</td>
                <td className="py-1.5 text-right">
                  {Math.round(e)}%{drop && <span className="ml-1 text-[10px] text-amber-700">▼ gap</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function StudiesTab({ meta }: { meta: Meta }) {
  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api<Trial[]>("/api/v1/trials").then(setTrials);
  }, []);
  useEffect(load, [load]);

  const toggle = async (t: Trial) => {
    await api(`/api/v1/trials/${t.id}`, { method: "PATCH", json: { status: t.status === "Recruiting" ? "Paused" : "Recruiting" } });
    load();
  };

  if (adding) return <AddTrial meta={meta} onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />;
  if (!trials) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <SectionTitle hint="Studies you coordinate. Paused studies are hidden from patients.">Studies</SectionTitle>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" /> New study
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {trials.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500 font-mono">
                  {t.protocolId} · {t.phase}
                </div>
                <div className="font-medium mt-0.5">{t.shortTitle}</div>
              </div>
              <Button size="sm" variant={t.status === "Recruiting" ? "secondary" : "primary"} onClick={() => toggle(t)}>
                {t.status === "Recruiting" ? "Pause" : "Resume"}
              </Button>
            </div>
            <p className="text-sm text-slate-600 mt-2 line-clamp-3">{t.summary}</p>
            <div className="text-xs text-slate-500 mt-2">
              {t.status} · {t.sites.map((s) => s.city).join(" · ")}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
