"use client";

import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { Button, Card, ErrorNote, Field, MultiChips, SectionTitle, SingleChips, inputCls } from "./ui";

export default function AddTrial({ meta, onDone, onCancel }: { meta: Meta; onDone: () => void; onCancel: () => void }) {
  const [t, setT] = useState({
    shortTitle: "",
    title: "",
    sponsor: "",
    phase: "Phase 2",
    interventionType: meta.interventionTypes[0],
    intervention: "",
    placebo: false,
    durationWeeks: 12,
    visits: 6,
    remoteVisits: false,
    fullyRemote: false,
    travelSupport: false,
    compensation: "",
    targetEnrollment: 60,
  });
  const [sites, setSites] = useState([{ name: "", city: meta.cities[0] }]);
  const [c, setC] = useState({
    minAge: 18,
    maxAge: 80,
    conditions: [] as string[],
    minAvgPain: 4,
    minDurationMonths: 3,
    maxOpioidMME: "" as number | "",
    excludeComorbidities: [] as string[],
    excludeTreatments: [] as string[],
    otherCriteria: "",
  });
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [expect, setExpect] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => setT((p) => ({ ...p, [k]: v }));

  const draft = async () => {
    setAiBusy(true);
    try {
      const r = await api<{ summary: string; whatToExpect: string[] }>("/api/v1/trials/lay-summary", { method: "POST", json: { protocolNotes: notes, trial: t } });
      setSummary(r.summary);
      setExpect(r.whatToExpect);
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/v1/trials", {
        method: "POST",
        json: {
          ...t,
          title: t.title || t.shortTitle,
          summary,
          whatToExpect: expect,
          sites: sites.filter((s) => s.name.trim()),
          criteria: {
            ...c,
            maxOpioidMME: c.maxOpioidMME === "" ? null : c.maxOpioidMME,
            requiresPlacebo: t.placebo,
            otherCriteria: c.otherCriteria.split("\n").map((x) => x.trim()).filter(Boolean),
          },
        },
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <SectionTitle hint="Structured criteria power the patient pre-screen. Free-text criteria are shown as 'confirmed at screening'.">New study</SectionTitle>
      <Card className="p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Short title (patient-facing)">
            <input className={inputCls} value={t.shortTitle} onChange={(e) => set("shortTitle", e.target.value)} />
          </Field>
          <Field label="Sponsor">
            <input className={inputCls} value={t.sponsor} onChange={(e) => set("sponsor", e.target.value)} />
          </Field>
        </div>
        <Field label="Official title">
          <input className={inputCls} value={t.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Phase">
            <select className={inputCls} value={t.phase} onChange={(e) => set("phase", e.target.value)}>
              {["Phase 1", "Phase 2", "Phase 3", "Phase 4", "N/A (device)", "N/A (behavioral)", "Observational"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Duration (weeks)">
            <input type="number" className={inputCls} value={t.durationWeeks} onChange={(e) => set("durationWeeks", num(e.target.value))} />
          </Field>
          <Field label="Visits">
            <input type="number" className={inputCls} value={t.visits} onChange={(e) => set("visits", num(e.target.value))} />
          </Field>
        </div>
        <Field label="Intervention type">
          <SingleChips options={meta.interventionTypes} value={t.interventionType} onChange={(v) => set("interventionType", v)} />
        </Field>
        <Field label="Intervention">
          <input className={inputCls} value={t.intervention} onChange={(e) => set("intervention", e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["placebo", "Placebo / sham arm"],
              ["remoteVisits", "Some visits remote"],
              ["fullyRemote", "Fully remote"],
              ["travelSupport", "Travel reimbursed"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={t[k]} onChange={(e) => set(k, e.target.checked)} className="accent-[var(--color-brand-600)]" /> {l}
            </label>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Compensation">
            <input className={inputCls} value={t.compensation} onChange={(e) => set("compensation", e.target.value)} placeholder="e.g. Up to $600" />
          </Field>
          <Field label="Target enrollment">
            <input type="number" className={inputCls} value={t.targetEnrollment} onChange={(e) => set("targetEnrollment", num(e.target.value))} />
          </Field>
        </div>
        <Field label="Sites">
          <div className="space-y-2">
            {sites.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputCls} placeholder="Site name" value={s.name} onChange={(e) => setSites(sites.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <select className={inputCls} value={s.city} onChange={(e) => setSites(sites.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))}>
                  {meta.cities.map((ct) => (
                    <option key={ct}>{ct}</option>
                  ))}
                </select>
                <Button variant="ghost" onClick={() => setSites(sites.filter((_, j) => j !== i))} disabled={sites.length === 1} aria-label="Remove site">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setSites([...sites, { name: "", city: meta.cities[0] }])}>
              Add site
            </Button>
          </div>
        </Field>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="font-medium">Eligibility criteria</div>
        <Field label="Qualifying conditions">
          <MultiChips options={meta.conditions} value={c.conditions} onChange={(v) => setC({ ...c, conditions: v })} />
        </Field>
        <div className="grid sm:grid-cols-5 gap-3">
          {(
            [
              ["minAge", "Min age"],
              ["maxAge", "Max age"],
              ["minAvgPain", "Min avg pain"],
              ["minDurationMonths", "Min months"],
              ["maxOpioidMME", "Max MME"],
            ] as const
          ).map(([k, l]) => (
            <Field key={k} label={l}>
              <input
                type="number"
                className={inputCls}
                value={c[k]}
                placeholder={k === "maxOpioidMME" ? "No limit" : undefined}
                onChange={(e) => setC({ ...c, [k]: k === "maxOpioidMME" && e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        <Field label="Exclude if they have">
          <MultiChips options={meta.comorbidities} value={c.excludeComorbidities} onChange={(v) => setC({ ...c, excludeComorbidities: v })} />
        </Field>
        <Field label="Exclude if currently using">
          <MultiChips options={meta.treatments} value={c.excludeTreatments} onChange={(v) => setC({ ...c, excludeTreatments: v })} />
        </Field>
        <Field label="Other criteria (confirmed at screening)" hint="One per line">
          <textarea className={inputCls} rows={3} value={c.otherCriteria} onChange={(e) => setC({ ...c, otherCriteria: e.target.value })} />
        </Field>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="font-medium">Patient-facing description</div>
        <Field label="Protocol notes" hint="Paste a synopsis; AI drafts a plain-language summary for you to edit.">
          <textarea className={inputCls} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={draft} loading={aiBusy}>
          <Sparkles className="size-4" /> Draft plain-language summary
        </Button>
        <Field label="Summary">
          <textarea className={inputCls} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="What to expect" hint="One per line">
          <textarea className={inputCls} rows={4} value={expect.join("\n")} onChange={(e) => setExpect(e.target.value.split("\n"))} />
        </Field>
      </Card>

      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} loading={busy} disabled={!t.shortTitle || !sites.some((s) => s.name.trim()) || !c.conditions.length}>
          Publish study
        </Button>
      </div>
    </div>
  );
}
