"use client";

import { Activity, ClipboardList, HeartHandshake, LineChart, Scale, ShieldCheck } from "lucide-react";
import BrandMark from "./BrandMark";
import { Button, Card } from "./ui";
import type { Role, User } from "@/lib/types";

const FEATURES = [
  {
    Icon: HeartHandshake,
    title: "Trial matching that respects you",
    body: "Rule-based eligibility you can see line by line, plus an AI fit score. Barriers like travel or work schedule are paired with supports, never counted against you.",
  },
  {
    Icon: LineChart,
    title: "Personal pain forecast",
    body: "A one-minute daily diary powers a 7-day pain forecast, flare-risk estimate, and what-if scenarios that learn from your own patterns.",
  },
  {
    Icon: Activity,
    title: "Self-management coaching",
    body: "A weekly plan built from your top pain drivers: pacing, sleep, stress, and a flare plan. A coach is on hand for questions.",
  },
  {
    Icon: ClipboardList,
    title: "Recruitment pipeline for study teams",
    body: "Pre-screened referrals with an AI brief, contact notes, screening scheduling, and diary adherence for retention.",
  },
  {
    Icon: Scale,
    title: "Equity built in",
    body: "Coordinators see a representation snapshot of referred vs. enrolled participants, so drop-off in any group is visible early.",
  },
  {
    Icon: ShieldCheck,
    title: "You control your data",
    body: "Nothing is shared with a study team until you explicitly consent, per study. AI only ever sees de-identified answers.",
  },
];

export default function Landing({
  user,
  onEnter,
  onSignIn,
}: {
  user: User | null;
  onEnter: (role: Role) => void;
  onSignIn: () => void;
}) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <BrandMark /> PainBridge
        </div>
        {!user && (
          <Button variant="secondary" size="sm" onClick={onSignIn}>
            Sign in
          </Button>
        )}
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-sm font-medium text-brand-600 mb-3">For people living with chronic pain, and the teams studying it</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 leading-[1.1]">
            Find the right study. <br />
            Understand your pain.
          </h1>
          <p className="mt-5 text-lg text-slate-600 max-w-xl">
            PainBridge connects people with chronic pain to clinical trials they actually fit, forecasts pain from a daily
            diary, and turns those patterns into a practical self-management plan.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => onEnter("patient")} className="px-5 py-2.5">
              I live with chronic pain
            </Button>
            <Button variant="secondary" onClick={() => onEnter("coordinator")} className="px-5 py-2.5">
              I run a study
            </Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Demo accounts (password <code>demo1234</code>): patient@painbridge.demo · coordinator@painbridge.demo
          </p>
        </div>
        <Card className="p-6">
          <div className="text-xs font-medium text-slate-500 mb-2">How it works</div>
          <ol className="space-y-4">
            {[
              ["Tell us about your pain", "10 structured questions (condition, pain scores, treatments, preferences, barriers)."],
              ["Swipe through matched studies", "See why you fit, what's left to confirm, and what support is available."],
              ["Share with one study, only if you choose", "The study team gets your answers and follows up."],
              ["Log a 1-minute daily diary", "Get your forecast, flare risk, and weekly plan."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-3">
                <span className="size-6 shrink-0 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold grid place-items-center">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium">{t}</div>
                  <div className="text-sm text-slate-600">{b}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(({ Icon, title, body }) => (
          <Card key={title} className="p-5">
            <Icon className="size-5 text-brand-600" aria-hidden />
            <div className="mt-3 font-medium">{title}</div>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </Card>
        ))}
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500 px-4">
        Research prototype. All trials, sites and patients are fictional; not a medical device and not medical advice.
        In a crisis, call or text 988.
      </footer>
    </div>
  );
}
