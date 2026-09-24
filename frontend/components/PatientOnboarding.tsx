"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta, Profile } from "@/lib/types";
import { Button, Card, ErrorNote, Field, MultiChips, Scale, SingleChips, inputCls } from "./ui";

const FREQ = ["Not at all", "Several days", "More than half the days", "Nearly every day"] as const;

const EMPTY: Profile = {
  age: 40,
  sex: "Female",
  city: "Durham, NC",
  travelMiles: 25,
  painConditions: [],
  primaryCondition: "",
  painDurationMonths: 12,
  avgPain: 5,
  worstPain: 7,
  interference: 5,
  sleepQuality: 5,
  phq2: 0,
  gad2: 0,
  currentTreatments: [],
  dailyOpioidMME: 0,
  comorbidities: [],
  interventionPrefs: [],
  placeboOk: "Unsure",
  visitAvailability: [],
  barriers: [],
  preferredLanguage: "English",
};

export default function PatientOnboarding({
  meta,
  initial,
  onDone,
  onCancel,
}: {
  meta: Meta;
  initial: Profile | null;
  onDone: (p: Profile) => void;
  onCancel?: () => void;
}) {
  const [p, setP] = useState<Profile>(initial ?? EMPTY);
  const [phq, setPhq] = useState<[number, number]>([0, 0]);
  const [gad, setGad] = useState<[number, number]>([0, 0]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((prev) => ({ ...prev, [k]: v }));

  const steps = ["About you", "Your pain", "Health & treatments", "Study preferences"];
  const canNext = step !== 1 || (p.painConditions.length > 0 && p.primaryCondition);

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const body = {
        ...p,
        phq2: initial && phq[0] + phq[1] === 0 ? p.phq2 : phq[0] + phq[1],
        gad2: initial && gad[0] + gad[1] === 0 ? p.gad2 : gad[0] + gad[1],
        dailyOpioidMME: p.currentTreatments.includes("Opioids") ? p.dailyOpioidMME : 0,
      };
      onDone(await api<Profile>("/api/v1/patients/me/profile", { method: "PUT", json: body }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <div className="text-xs text-slate-500">
          Step {step + 1} of {steps.length}
        </div>
        <h1 className="text-2xl font-semibold">{steps[step]}</h1>
        <div className="mt-3 h-1.5 rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <Card className="p-6 space-y-6">
        {step === 0 && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Age">
                <input type="number" min={18} max={100} className={inputCls} value={p.age} onChange={(e) => set("age", Number(e.target.value))} />
              </Field>
              <Field label="Preferred language">
                <input className={inputCls} value={p.preferredLanguage} onChange={(e) => set("preferredLanguage", e.target.value)} />
              </Field>
            </div>
            <Field label="Sex" hint="Some studies have sex-specific criteria; you can decline to answer.">
              <SingleChips options={["Female", "Male", "Intersex", "Prefer not to say"] as const} value={p.sex} onChange={(v) => set("sex", v)} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nearest city">
                <select className={inputCls} value={p.city} onChange={(e) => set("city", e.target.value)}>
                  {meta.cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="How far could you travel for visits?">
                <select className={inputCls} value={p.travelMiles} onChange={(e) => set("travelMiles", Number(e.target.value))}>
                  {[10, 25, 50, 100, 250].map((m) => (
                    <option key={m} value={m}>
                      Up to {m} miles
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Which chronic pain conditions have you been diagnosed with?" hint="Select all that apply.">
              <MultiChips
                options={meta.conditions}
                value={p.painConditions}
                onChange={(v) => {
                  set("painConditions", v);
                  if (!v.includes(p.primaryCondition)) set("primaryCondition", v[0] ?? "");
                }}
              />
            </Field>
            {p.painConditions.length > 1 && (
              <Field label="Which one affects you most?">
                <SingleChips options={p.painConditions} value={p.primaryCondition} onChange={(v) => set("primaryCondition", v)} />
              </Field>
            )}
            <Field label="How long have you had this pain?">
              <select className={inputCls} value={p.painDurationMonths} onChange={(e) => set("painDurationMonths", Number(e.target.value))}>
                {[[3, "3-5 months"], [6, "6-11 months"], [12, "1-2 years"], [36, "3-5 years"], [72, "6-10 years"], [132, "More than 10 years"]].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Average pain over the past week">
              <Scale value={p.avgPain} onChange={(v) => set("avgPain", v)} low="No pain" high="Worst imaginable" />
            </Field>
            <Field label="Worst pain over the past week">
              <Scale value={p.worstPain} onChange={(v) => set("worstPain", v)} low="No pain" high="Worst imaginable" />
            </Field>
            <Field label="How much has pain interfered with your daily activities?">
              <Scale value={p.interference} onChange={(v) => set("interference", v)} low="Not at all" high="Completely" />
            </Field>
            <Field label="How well have you been sleeping?">
              <Scale value={p.sleepQuality} onChange={(v) => set("sleepQuality", v)} low="Very poorly" high="Very well" />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="What are you currently using for pain?" hint="Select all that apply.">
              <MultiChips options={meta.treatments} value={p.currentTreatments} onChange={(v) => set("currentTreatments", v)} />
            </Field>
            {p.currentTreatments.includes("Opioids") && (
              <Field label="Approximate daily opioid dose (MME)" hint="Your prescriber or pharmacist can tell you this. Leave 0 if unsure.">
                <input type="number" min={0} className={inputCls} value={p.dailyOpioidMME} onChange={(e) => set("dailyOpioidMME", Number(e.target.value))} />
              </Field>
            )}
            <Field label="Do any of these apply to you?" hint="Used only to check study criteria.">
              <MultiChips options={meta.comorbidities} value={p.comorbidities} onChange={(v) => set("comorbidities", v)} />
            </Field>
            <div className="space-y-4">
              <div className="text-sm font-medium">Over the last 2 weeks, how often have you been bothered by…</div>
              {[
                ["Little interest or pleasure in doing things", phq, setPhq, 0],
                ["Feeling down, depressed, or hopeless", phq, setPhq, 1],
                ["Feeling nervous, anxious, or on edge", gad, setGad, 0],
                ["Not being able to stop or control worrying", gad, setGad, 1],
              ].map(([q, arr, setArr, i]) => (
                <Field key={q as string} label={q as string}>
                  <SingleChips
                    options={FREQ}
                    value={FREQ[(arr as [number, number])[i as number]]}
                    onChange={(v) => {
                      const next = [...(arr as [number, number])] as [number, number];
                      next[i as number] = FREQ.indexOf(v);
                      (setArr as (x: [number, number]) => void)(next);
                    }}
                  />
                </Field>
              ))}
              <p className="text-xs text-slate-500">
                These standard questions (PHQ-2 / GAD-2) help study teams offer the right support. If you are having
                thoughts of harming yourself, call or text <strong>988</strong> now.
              </p>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="What kinds of studies interest you?">
              <MultiChips options={meta.interventionTypes} value={p.interventionPrefs} onChange={(v) => set("interventionPrefs", v)} />
            </Field>
            <Field
              label="Would you be open to a study where you might receive a placebo?"
              hint="Many studies compare a treatment with an inactive version. Your usual care continues."
            >
              <SingleChips options={["Yes", "Unsure", "No"] as const} value={p.placeboOk} onChange={(v) => set("placeboOk", v)} />
            </Field>
            <Field label="When could you attend visits?">
              <MultiChips options={["Weekdays", "Evenings", "Weekends"]} value={p.visitAvailability} onChange={(v) => set("visitAvailability", v)} />
            </Field>
            <Field
              label="Is anything likely to make participating harder?"
              hint="This never lowers your match. We use it to show you what support each study offers."
            >
              <MultiChips options={meta.barriers} value={p.barriers} onChange={(v) => set("barriers", v)} />
            </Field>
          </>
        )}

        {err && <ErrorNote>{err}</ErrorNote>}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => (step === 0 ? onCancel?.() : setStep(step - 1))}>
            <ArrowLeft className="size-4" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={save} loading={busy}>
              Save & see my matches
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
