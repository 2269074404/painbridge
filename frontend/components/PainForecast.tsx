"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Info, RefreshCw } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { Forecast, ModelCard } from "@/lib/types";
import { Button, Card, ErrorNote, Markdown, Modal, SectionTitle, Spinner, fmtDate } from "./ui";

export default function PainForecast({ version, onGoDiary }: { version: number; onGoDiary: () => void }) {
  const [fc, setFc] = useState<Forecast | null>(null);
  const [err, setErr] = useState("");
  const [card, setCard] = useState<ModelCard | null>(null);

  useEffect(() => {
    api<Forecast>("/api/v1/diary/forecast").then(setFc).catch((e) => setErr(e.message));
  }, [version]);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!fc) return <Spinner label="Running your forecast…" />;
  if (!fc.ready) {
    return (
      <Card className="p-8 text-center max-w-xl mx-auto">
        <h2 className="font-semibold">Your forecast unlocks after 7 days of check-ins</h2>
        <p className="text-sm text-slate-600 mt-1">{fc.entriesNeeded} more day(s) to go.</p>
        <Button className="mt-4" onClick={onGoDiary}>
          Log today
        </Button>
      </Card>
    );
  }

  const tomorrow = fc.forecast[0];
  const riskyDays = fc.forecast.filter((d) => d.flareProb >= 0.15);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat
          label="Tomorrow's expected pain"
          value={tomorrow.mean.toFixed(1)}
          unit="/ 10"
          sub={`Likely range ${tomorrow.low.toFixed(0)}–${tomorrow.high.toFixed(0)} · your usual ${fc.baseline}`}
        />
        <Stat
          label="Chance of a flare day this week"
          value={`${Math.round(fc.flareRisk7d * 100)}%`}
          sub={`Flare = pain ${fc.flareThreshold}+ (2 above your usual)`}
        />
        <Stat
          label="Model"
          value={fc.model === "personalized" ? "Personalized" : "Population"}
          sub={fc.model === "personalized" ? `Learned from ${fc.trainingDays} days of your diary` : "Personalizes after 21 days of check-ins"}
          action={
            <button className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1" onClick={() => api<ModelCard>("/api/v1/diary/model-card").then(setCard)}>
              <Info className="size-3" /> How accurate is this?
            </button>
          }
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-semibold">Pain: last 4 weeks and next 7 days</h2>
            <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
              <LegendSwatch dashed={false} label="Logged" />
              <LegendSwatch dashed label="Forecast" />
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: "var(--viz-series-1-soft)" }} /> 80% range
              </span>
            </div>
          </div>
          {riskyDays.length > 0 && (
            <div className="text-xs text-slate-600">
              Higher flare risk: {riskyDays.map((d) => fmtDate(d.date)).join(", ")}
            </div>
          )}
        </div>
        <ForecastChart fc={fc} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <SectionTitle hint="From your own diary: how a typical day-to-day swing in each factor relates to next-day pain. Associations, not proof of cause.">
            What moves your pain
          </SectionTitle>
          <Drivers drivers={fc.drivers} />
        </Card>
        <Card className="p-5">
          <SectionTitle hint="Model estimate for tomorrow if you change one thing today.">What if…</SectionTitle>
          <ul className="divide-y divide-slate-100">
            {fc.scenarios.map((s, i) => (
              <li key={s.label} className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm text-slate-700">{s.label}</span>
                <span className="text-sm tabular-nums flex items-center gap-2">
                  <span className="font-medium">{s.predicted.toFixed(1)}</span>
                  {i > 0 && (
                    <span className={"text-xs w-14 text-right " + (s.delta < -0.05 ? "text-[#006300]" : "text-slate-500")}>
                      {s.delta > 0 ? "+" : ""}
                      {s.delta.toFixed(2)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <WeeklyPlan version={version} />

      <p className="text-xs text-slate-500">
        Forecasts are statistical estimates from your diary and a model trained on simulated data. They are not a diagnosis.
        Don&apos;t change medications based on them; talk with your care team.
      </p>

      {card && <ModelCardModal card={card} onClose={() => setCard(null)} />}
    </div>
  );
}

function Stat({ label, value, unit, sub, action }: { label: string; value: string; unit?: string; sub?: string; action?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-slate-900">
        {value}
        {unit && <span className="text-base font-normal text-slate-500 ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

function LegendSwatch({ dashed, label }: { dashed: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="6" aria-hidden>
        <line x1="1" y1="3" x2="17" y2="3" stroke="var(--viz-series-1)" strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}

type Row = { date: string; pain?: number; mean?: number; band?: [number, number]; flareProb?: number };

function ForecastChart({ fc }: { fc: Extract<Forecast, { ready: true }> }) {
  const rows = useMemo<Row[]>(() => {
    const hist: Row[] = fc.history.map((h) => ({ date: h.date, pain: h.pain }));
    const last = hist[hist.length - 1];
    if (last) {
      last.mean = last.pain; // join the dashed forecast to the last logged point
      last.band = [last.pain!, last.pain!];
    }
    return [...hist, ...fc.forecast.map((f) => ({ date: f.date, mean: f.mean, band: [f.low, f.high] as [number, number], flareProb: f.flareProb }))];
  }, [fc]);
  const todayIdx = fc.history.length - 1;

  return (
    <div className="h-72 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => fmtDate(d)}
            tick={{ fontSize: 11, fill: "var(--viz-muted)" }}
            axisLine={{ stroke: "var(--viz-axis)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} width={28} tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} />
          <ReferenceLine
            y={fc.flareThreshold}
            stroke="var(--viz-muted)"
            strokeDasharray="2 4"
            label={{ value: "flare threshold", position: "insideTopLeft", fontSize: 10, fill: "var(--viz-muted)" }}
          />
          {rows[todayIdx] && (
            <ReferenceLine x={rows[todayIdx].date} stroke="var(--viz-axis)" label={{ value: "last check-in", position: "insideTopRight", fontSize: 10, fill: "var(--viz-muted)" }} />
          )}
          <Area dataKey="band" stroke="none" fill="var(--viz-series-1-soft)" fillOpacity={0.8} isAnimationActive={false} activeDot={false} />
          <Line dataKey="pain" stroke="var(--viz-series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="mean" stroke="var(--viz-series-1)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const isForecast = r.pain === undefined;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <div className="font-medium text-slate-900">{fmtDate(r.date)}</div>
      {isForecast ? (
        <>
          <div className="text-slate-700">Forecast {r.mean?.toFixed(1)} (range {r.band?.[0].toFixed(1)}–{r.band?.[1].toFixed(1)})</div>
          <div className="text-slate-500">Flare chance {Math.round((r.flareProb ?? 0) * 100)}%</div>
        </>
      ) : (
        <div className="text-slate-700">Logged pain {r.pain}</div>
      )}
    </div>
  );
}

function Drivers({ drivers }: { drivers: Extract<Forecast, { ready: true }>["drivers"] }) {
  if (!drivers.length) return <p className="text-sm text-slate-500">Keep logging to see your personal drivers.</p>;
  const max = Math.max(...drivers.map((d) => Math.abs(d.effect)), 0.5);
  return (
    <ul className="space-y-3">
      {drivers.map((d) => {
        const pct = (Math.abs(d.effect) / max) * 50;
        const raises = d.direction === "raises";
        return (
          <li key={d.factor} title={d.explanation}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-800">{d.label}</span>
              <span className="text-xs text-slate-600 inline-flex items-center gap-0.5 tabular-nums">
                {raises ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
                {raises ? "raises" : "lowers"} pain {Math.abs(d.effect).toFixed(2)}
              </span>
            </div>
            <div className="relative mt-1 h-2.5 rounded bg-slate-100" aria-hidden>
              <div className="absolute top-0 bottom-0 w-px bg-slate-400" style={{ left: "50%" }} />
              <div
                className="absolute top-0 bottom-0"
                style={{
                  background: raises ? "var(--viz-raise)" : "var(--viz-lower)",
                  left: raises ? "50%" : `${50 - pct}%`,
                  width: `${pct}%`,
                  borderRadius: raises ? "0 4px 4px 0" : "4px 0 0 4px",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function WeeklyPlan({ version }: { version: number }) {
  const [md, setMd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = (refresh = false) => {
    setBusy(true);
    setErr("");
    api<{ markdown: string }>(`/api/v1/diary/plan${refresh ? "?refresh=true" : ""}`)
      .then((r) => setMd(r.markdown))
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  useEffect(() => load(), [version]);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle hint="Built from your forecast and top drivers. Refreshes when you log a new day.">Your pain management plan this week</SectionTitle>
        <Button variant="ghost" size="sm" onClick={() => load(true)} loading={busy} aria-label="Regenerate plan">
          {!busy && <RefreshCw className="size-4" />}
        </Button>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
      {md ? <Markdown>{md}</Markdown> : !err && <Spinner label="Writing your plan…" />}
    </Card>
  );
}

function ModelCardModal({ card, onClose }: { card: ModelCard; onClose: () => void }) {
  const rows: [string, number][] = [
    ["This model (population)", card.maeModel],
    ["Guess: same as yesterday", card.maePersistence],
    ["Guess: your 7-day average", card.maeMean7],
  ];
  return (
    <Modal onClose={onClose}>
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">About the forecast model</h2>
        <p className="text-sm text-slate-600">
          Predicts {card.target.toLowerCase()}. {card.trainedOn}; evaluated on {card.testSet.toLowerCase()}.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="font-medium pb-1">Method</th>
              <th className="font-medium pb-1 text-right">Avg. error (points)</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="py-1.5">{k}</td>
                <td className="py-1.5 text-right">{v.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-100">
              <td className="py-1.5">Personalized (last 30 days)</td>
              <td className="py-1.5 text-right">
                {card.maePersonalizedLast30.toFixed(2)} <span className="text-xs text-slate-500">vs {card.maePopulationLast30.toFixed(2)} population</span>
              </td>
            </tr>
          </tbody>
        </table>
        <Markdown>{card.limitations.map((l) => `- ${l}`).join("\n")}</Markdown>
      </div>
    </Modal>
  );
}
