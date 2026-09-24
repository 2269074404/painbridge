"use client";

import { useEffect, useState } from "react";
import { Check, CircleDashed, ClipboardCheck, HandHeart, Sparkles, X } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { Meta, Prescreen, ReferralDetail as Detail } from "@/lib/types";
import { Button, EligibilityBadge, ErrorNote, Markdown, Modal, RiskBadge, ScoreRing, Spinner, fmtDate, inputCls } from "./ui";

export default function ReferralDetail({ id, meta, onClose, onChanged }: { id: string; meta: Meta; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [brief, setBrief] = useState<Prescreen | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [sumBusy, setSumBusy] = useState(false);
  const [visit, setVisit] = useState("");

  useEffect(() => {
    api<Detail>(`/api/v1/coordinator/referrals/${id}`)
      .then((x) => {
        setD(x);
        setBrief(x.prescreen);
        setVisit(x.screeningVisitAt ?? "");
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  const patch = async (json: Record<string, unknown>) => {
    try {
      setD(await api<Detail>(`/api/v1/coordinator/referrals/${id}`, { method: "PATCH", json }));
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const runBrief = async () => {
    setBriefBusy(true);
    try {
      setBrief(await api<Prescreen>(`/api/v1/coordinator/referrals/${id}/prescreen`, { method: "POST" }));
    } finally {
      setBriefBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim() || !d) return;
    const n = await api<Detail["notes"][number]>(`/api/v1/coordinator/referrals/${id}/notes`, { method: "POST", json: { text: note } });
    setD({ ...d, notes: [...d.notes, n] });
    setNote("");
  };

  const summarize = async () => {
    setSumBusy(true);
    try {
      setSummary((await api<{ markdown: string }>(`/api/v1/coordinator/referrals/${id}/notes/summary`, { method: "POST" })).markdown);
    } finally {
      setSumBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      {!d ? (
        <div className="p-6">{err ? <ErrorNote>{err}</ErrorNote> : <Spinner />}</div>
      ) : (
        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-full bg-brand-50 text-brand-700 font-semibold grid place-items-center shrink-0">{d.patient.initials}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-lg">{d.contact.name}</div>
              <div className="text-sm text-slate-600">
                {d.patient.age} · {d.patient.sex} · {d.patient.city} · {d.contact.email}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <EligibilityBadge status={d.eligibility.status} />
                <span className="text-slate-500">
                  {d.trial.protocolId} · {d.trial.shortTitle}
                </span>
              </div>
            </div>
            <ScoreRing score={d.match?.score ?? d.matchScore} size={52} />
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end rounded-xl bg-slate-50 p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-slate-500 space-y-1">
                <span>Status</span>
                <select className={inputCls} value={d.status} onChange={(e) => patch({ status: e.target.value })}>
                  {meta.referralStatuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500 space-y-1">
                <span>Screening visit</span>
                <input type="datetime-local" className={inputCls} value={visit} onChange={(e) => setVisit(e.target.value)} />
              </label>
            </div>
            <Button
              variant="secondary"
              onClick={() => patch({ screeningVisitAt: visit, ...(visit && ["New", "Pre-screening", "Contacted"].includes(d.status) ? { status: "Screening visit scheduled" } : {}) })}
            >
              Save visit
            </Button>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-1.5">
                  <Sparkles className="size-4 text-brand-600" /> Pre-screen brief
                </h3>
                <Button size="sm" variant="secondary" onClick={runBrief} loading={briefBusy}>
                  {brief ? "Regenerate" : "Generate"}
                </Button>
              </div>
              {brief ? (
                <div className="space-y-3 text-sm">
                  <p className="text-slate-700">{brief.summary}</p>
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                      <ClipboardCheck className="size-3.5" /> Verify at screening
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 text-slate-700">
                      {brief.verify.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </div>
                  {brief.supports.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <HandHeart className="size-3.5" /> Supports to offer
                      </div>
                      <ul className="list-disc pl-5 space-y-0.5 text-slate-700">
                        {brief.supports.map((v) => (
                          <li key={v}>{v}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Generate a brief of what to verify and which supports to offer this referral.</p>
              )}

              <h3 className="font-medium pt-2">Eligibility (rule-based)</h3>
              <ul className="space-y-1 text-sm">
                {d.eligibility.met.map((c) => (
                  <li key={c} className="flex gap-2">
                    <Check className="size-4 shrink-0 mt-0.5" style={{ color: "var(--status-good)" }} aria-label="Met" /> {c}
                  </li>
                ))}
                {d.eligibility.unmet.map((c) => (
                  <li key={c} className="flex gap-2">
                    <X className="size-4 shrink-0 mt-0.5" style={{ color: "var(--status-critical)" }} aria-label="Not met" /> {c}
                  </li>
                ))}
                {d.eligibility.toConfirm.map((c) => (
                  <li key={c} className="flex gap-2 text-slate-500">
                    <CircleDashed className="size-4 shrink-0 mt-0.5" aria-label="To confirm" /> {c}
                  </li>
                ))}
              </ul>

              <h3 className="font-medium pt-2">Patient answers</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {[
                  ["Conditions", d.profile.painConditions?.join(", ")],
                  ["Duration", `${d.profile.painDurationMonths} months`],
                  ["Avg / worst pain", `${d.profile.avgPain} / ${d.profile.worstPain}`],
                  ["Interference", `${d.profile.interference}/10`],
                  ["PHQ-2 / GAD-2", `${d.profile.phq2} / ${d.profile.gad2}`],
                  ["Opioids", `${d.profile.dailyOpioidMME} MME/day`],
                  ["Treatments", d.profile.currentTreatments?.join(", ") || "None"],
                  ["Other conditions", d.profile.comorbidities?.join(", ") || "None"],
                  ["Placebo OK", d.profile.placeboOk],
                  ["Availability", d.profile.visitAvailability?.join(", ") || "Not given"],
                  ["Barriers", d.profile.barriers?.join(", ") || "None"],
                  ["Language", d.profile.preferredLanguage],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-slate-500">{k}</dt>
                    <dd className="text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="space-y-3">
              <h3 className="font-medium">Pain diary</h3>
              {d.diary && d.diaryHistory.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <MiniStat label="Adherence (14d)" value={`${Math.round(d.diary.adherence14d * 100)}%`} />
                    <MiniStat label="Avg pain (14d)" value={d.diary.avgPain14d?.toFixed(1) ?? "–"} />
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="text-[11px] text-slate-500">Retention risk</div>
                      <div className="mt-0.5">
                        <RiskBadge level={d.diary.retentionRisk} />
                      </div>
                    </div>
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={d.diaryHistory} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                        <XAxis dataKey="date" tickFormatter={(x) => fmtDate(x)} tick={{ fontSize: 10, fill: "var(--viz-muted)" }} tickLine={false} axisLine={{ stroke: "var(--viz-axis)" }} minTickGap={30} />
                        <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={{ fontSize: 10, fill: "var(--viz-muted)" }} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(v) => [`${v}/10`, "Pain"]} labelFormatter={(l) => fmtDate(String(l))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Line dataKey="pain" stroke="var(--viz-series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-slate-500">
                    Last entry {d.diary.daysSinceLastEntry} day(s) ago · trend {d.diary.weeklyTrend > 0 ? "+" : ""}
                    {d.diary.weeklyTrend.toFixed(2)} pts/week
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">{d.diary ? "No diary entries yet." : "Patient chose not to share their diary."}</p>
              )}

              <div className="flex items-center justify-between pt-2">
                <h3 className="font-medium">Contact & screening notes</h3>
                <Button size="sm" variant="secondary" onClick={summarize} loading={sumBusy} disabled={!d.notes.length}>
                  <Sparkles className="size-3.5" /> Summarize
                </Button>
              </div>
              {summary && (
                <div className="rounded-lg bg-brand-50 p-3">
                  <Markdown>{summary}</Markdown>
                </div>
              )}
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {d.notes.map((n, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="text-slate-800">{n.text}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {n.authorEmail} · {fmtDate(n.createdAt, true)}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Log a call, voicemail, or screening note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
                <Button onClick={addNote} disabled={!note.trim()}>
                  Add
                </Button>
              </div>

              <h3 className="font-medium pt-2">Timeline</h3>
              <ol className="border-l border-slate-200 ml-1.5 space-y-2">
                {d.timeline.map((t, i) => (
                  <li key={i} className="pl-3 relative text-sm">
                    <span className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-brand-500" />
                    <span className="text-slate-800">{t.status}</span>
                    <span className="text-xs text-slate-400"> · {fmtDate(t.at, true)} · {t.by}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      )}
    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
