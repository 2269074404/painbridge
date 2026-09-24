"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, MessageCircleQuestion, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { SavedItem } from "@/lib/types";
import TrialCard from "./TrialCard";
import { Button, Card, ErrorNote, Modal, ScoreRing, SectionTitle, Spinner, EligibilityBadge, fmtDate } from "./ui";

const PIPELINE = ["New", "Pre-screening", "Contacted", "Screening visit scheduled", "Enrolled"];
const PATIENT_LABEL: Record<string, string> = {
  New: "Shared with study team",
  "Pre-screening": "Team is reviewing",
  Contacted: "Team contacted you",
  "Screening visit scheduled": "Screening visit booked",
  Enrolled: "Enrolled",
  "Screen fail": "Not eligible this time",
  Withdrawn: "Withdrawn",
};

export default function MyStudies({ onAsk, onBrowse }: { onAsk: (trialId: string) => void; onBrowse: () => void }) {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [sharing, setSharing] = useState<SavedItem | null>(null);

  const load = useCallback(() => {
    api<SavedItem[]>("/api/v1/patients/me/saved").then(setItems).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!items) return <Spinner />;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <SectionTitle hint="Nothing is shared with a study team until you choose to share it, one study at a time.">My studies</SectionTitle>
      {items.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-600">You haven&apos;t saved any studies yet.</p>
          <Button className="mt-4" onClick={onBrowse}>
            Browse matched studies
          </Button>
        </Card>
      )}
      {items.map((it) => {
        const ref = it.referral;
        const expanded = open === it.trial.id;
        return (
          <Card key={it.trial.id} className="p-5">
            <div className="flex items-start gap-4">
              <ScoreRing score={it.match.score} size={48} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{it.trial.shortTitle}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <EligibilityBadge status={it.eligibility.status} />
                  <span className="text-xs text-slate-500">
                    {it.trial.phase} · {it.trial.durationWeeks} wks
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onAsk(it.trial.id)} aria-label="Ask about this study">
                  <MessageCircleQuestion className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen(expanded ? null : it.trial.id)} aria-label="Details">
                  {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </div>
            </div>

            {ref ? (
              <StatusTracker status={ref.status} timeline={ref.timeline} visit={ref.screeningVisitAt} />
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="text-sm text-slate-600">Ready to talk to this study team?</span>
                <Button size="sm" onClick={() => setSharing(it)}>
                  <Send className="size-3.5" /> Share my profile
                </Button>
              </div>
            )}

            {expanded && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <TrialCard trial={it.trial} eligibility={it.eligibility} match={it.match} />
              </div>
            )}
          </Card>
        );
      })}
      {sharing && <ShareModal item={sharing} onClose={() => setSharing(null)} onShared={() => { setSharing(null); load(); }} />}
    </div>
  );
}

function StatusTracker({ status, timeline, visit }: { status: string; timeline: { status: string; at: string }[]; visit?: string | null }) {
  const ended = status === "Screen fail" || status === "Withdrawn";
  const reached = PIPELINE.indexOf(status);
  const when = Object.fromEntries(timeline.map((t) => [t.status, t.at]));
  return (
    <div className="mt-4">
      {ended ? (
        <p className="text-sm text-slate-600">
          {PATIENT_LABEL[status]}. Thank you for your interest. Your answers stay saved, so other studies may still be a fit.
        </p>
      ) : (
        <ol className="grid grid-cols-5 gap-1">
          {PIPELINE.map((s, i) => (
            <li key={s} className="text-center">
              <div className="flex justify-center">
                {i <= reached ? (
                  <CheckCircle2 className="size-5 text-brand-600" aria-label="Done" />
                ) : (
                  <Circle className="size-5 text-slate-300" aria-label="Pending" />
                )}
              </div>
              <div className={"mt-1 text-[11px] leading-tight " + (i <= reached ? "text-slate-800" : "text-slate-400")}>{PATIENT_LABEL[s]}</div>
              {when[s] && <div className="text-[10px] text-slate-400">{fmtDate(when[s])}</div>}
            </li>
          ))}
        </ol>
      )}
      {visit && status === "Screening visit scheduled" && (
        <p className="mt-3 text-sm text-brand-700">Your screening visit: {fmtDate(visit, true)}</p>
      )}
    </div>
  );
}

function ShareModal({ item, onClose, onShared }: { item: SavedItem; onClose: () => void; onShared: () => void }) {
  const [consent, setConsent] = useState(false);
  const [diary, setDiary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const share = async () => {
    setBusy(true);
    try {
      await api("/api/v1/patients/me/referrals", { method: "POST", json: { trialId: item.trial.id, consentToShare: consent, shareDiary: diary } });
      onShared();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Share with this study team?</h2>
        <p className="text-sm text-slate-600">
          The <strong>{item.trial.shortTitle}</strong> team ({item.eligibility.nearestSite ?? item.trial.sponsor}) will see
          your name, email, and your health-profile answers so they can contact you about screening.
        </p>
        <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li>Sharing is not agreeing to join. Formal informed consent happens later, with the study team.</li>
          <li>You can say no at any point, and your usual care is not affected.</li>
        </ul>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={diary} onChange={(e) => setDiary(e.target.checked)} className="mt-0.5 accent-[var(--color-brand-600)]" />
          Also share my pain diary trend (helps them see pain levels over time)
        </label>
        <label className="flex gap-2 text-sm font-medium">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--color-brand-600)]" />
          I agree to share my information with this study team
        </label>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={share} disabled={!consent} loading={busy}>
            Share
          </Button>
        </div>
      </div>
    </Modal>
  );
}
