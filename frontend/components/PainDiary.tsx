"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import type { DiaryEntry, Meta } from "@/lib/types";
import { Button, Card, ErrorNote, Field, MultiChips, Scale, SectionTitle, Spinner, cx, fmtDate, inputCls } from "./ui";

function localISO(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default function PainDiary({ meta, onSaved }: { meta: Meta; onSaved: () => void }) {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [e, setE] = useState<DiaryEntry>({
    date: localISO(),
    pain: 5,
    sleepHours: 7,
    sleepQuality: 5,
    mood: 5,
    stress: 5,
    activityMinutes: 30,
    rescueMeds: false,
    triggers: [],
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const list = await api<DiaryEntry[]>("/api/v1/diary");
      setEntries(list);
      const existing = list.find((x) => x.date === e.date);
      if (existing) setE(existing);
    } catch (x) {
      setErr((x as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof DiaryEntry>(k: K, v: DiaryEntry[K]) => {
    setSaved(false);
    setE((p) => ({ ...p, [k]: v }));
  };

  const pickDate = (date: string) => {
    const existing = entries?.find((x) => x.date === date);
    setSaved(false);
    setE(existing ?? { ...e, date, notes: "", triggers: [] });
  };

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/v1/diary", { method: "POST", json: e });
      setSaved(true);
      await load();
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const demoFill = async () => {
    setFilling(true);
    await api("/api/v1/diary/demo-fill", { method: "POST" });
    await load();
    setFilling(false);
    onSaved();
  };

  const last28 = useMemo(() => {
    const byDate = Object.fromEntries((entries ?? []).map((x) => [x.date, x]));
    return Array.from({ length: 28 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (27 - i));
      const iso = localISO(d);
      return { iso, entry: byDate[iso] as DiaryEntry | undefined };
    });
  }, [entries]);

  if (!entries) return err ? <ErrorNote>{err}</ErrorNote> : <Spinner />;

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-5 max-w-5xl mx-auto">
      <Card className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle hint="About one minute. Consistency matters more than precision.">Daily check-in</SectionTitle>
          <input type="date" className={cx(inputCls, "w-auto")} value={e.date} max={localISO()} onChange={(x) => pickDate(x.target.value)} />
        </div>
        <Field label="Pain today (average)">
          <Scale value={e.pain} onChange={(v) => set("pain", v)} low="No pain" high="Worst imaginable" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Hours slept last night">
            <input type="number" step={0.5} min={0} max={16} className={inputCls} value={e.sleepHours} onChange={(x) => set("sleepHours", Number(x.target.value))} />
          </Field>
          <Field label="Minutes of physical activity">
            <input type="number" step={5} min={0} max={600} className={inputCls} value={e.activityMinutes} onChange={(x) => set("activityMinutes", Number(x.target.value))} />
          </Field>
        </div>
        <Field label="Sleep quality">
          <Scale value={e.sleepQuality} onChange={(v) => set("sleepQuality", v)} low="Very poor" high="Excellent" />
        </Field>
        <Field label="Stress">
          <Scale value={e.stress} onChange={(v) => set("stress", v)} low="Calm" high="Extremely stressed" />
        </Field>
        <Field label="Mood">
          <Scale value={e.mood} onChange={(v) => set("mood", v)} low="Very low" high="Very good" />
        </Field>
        <Field label="Possible triggers today">
          <MultiChips options={meta.triggers} value={e.triggers} onChange={(v) => set("triggers", v)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={e.rescueMeds} onChange={(x) => set("rescueMeds", x.target.checked)} className="accent-[var(--color-brand-600)]" />
          I needed extra / rescue pain medication today
        </label>
        <Field label="Notes (optional)">
          <textarea className={inputCls} rows={2} value={e.notes} onChange={(x) => set("notes", x.target.value)} />
        </Field>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy}>
            Save check-in
          </Button>
          {saved && (
            <span className="text-sm text-brand-700 inline-flex items-center gap-1">
              <Check className="size-4" /> Saved. Your forecast has been updated.
            </span>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-1">Last 4 weeks</div>
          <div className="text-xs text-slate-500 mb-3">{last28.filter((d) => d.entry).length} of 28 days logged · darker = more pain</div>
          <div className="grid grid-cols-7 gap-1">
            {last28.map(({ iso, entry }) => (
              <button
                key={iso}
                onClick={() => pickDate(iso)}
                title={entry ? `${fmtDate(iso)}: pain ${entry.pain}/10` : `${fmtDate(iso)}: not logged`}
                aria-label={entry ? `${fmtDate(iso)}, pain ${entry.pain}` : `${fmtDate(iso)}, not logged`}
                className={cx(
                  "aspect-square rounded-md text-[10px] tabular-nums grid place-items-center ring-1",
                  iso === e.date ? "ring-2 ring-slate-900" : "ring-transparent",
                  !entry && "bg-slate-100 text-slate-400"
                )}
                style={entry ? { background: PAIN_RAMP[entry.pain], color: entry.pain >= 6 ? "#fff" : "#0b0b0b" } : undefined}
              >
                {entry ? entry.pain : new Date(iso + "T12:00").getDate()}
              </button>
            ))}
          </div>
        </Card>
        {entries.length < 21 && (
          <Card className="p-4">
            <div className="text-sm font-medium">Exploring the demo?</div>
            <p className="text-xs text-slate-500 mt-1">
              Forecasts start at 7 days and become personalized at 21+. Fill 45 days of simulated entries to try it now.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={demoFill} loading={filling}>
              <Wand2 className="size-3.5" /> Fill demo diary
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}

// Sequential single-hue ramp (blue 100 -> 700) for pain 0-10.
const PAIN_RAMP = ["#e8f1fc", "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281", "#0d366b"];
