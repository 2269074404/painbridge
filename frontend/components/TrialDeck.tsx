"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, MessageCircleQuestion, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/api";
import type { DeckItem, Match } from "@/lib/types";
import TrialCard from "./TrialCard";
import { Button, Card, ErrorNote, Spinner } from "./ui";

export default function TrialDeck({ onAsk, onViewSaved }: { onAsk: (trialId: string) => void; onViewSaved: () => void }) {
  const [deck, setDeck] = useState<DeckItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [err, setErr] = useState("");
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const [liked, setLiked] = useState(0);

  const load = useCallback(async () => {
    setErr("");
    try {
      setDeck(await api<DeckItem[]>("/api/v1/patients/me/trials"));
      setIdx(0);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = deck?.[idx];

  // Upgrade the instant rule-based score to the AI score for the visible card.
  useEffect(() => {
    if (!current || matches[current.trial.id]) return;
    let cancelled = false;
    api<{ match: Match }>(`/api/v1/patients/me/trials/${current.trial.id}/match`)
      .then((r) => !cancelled && setMatches((m) => ({ ...m, [current.trial.id]: r.match })))
      .catch(() => !cancelled && setMatches((m) => ({ ...m, [current.trial.id]: current.match })));
    return () => {
      cancelled = true;
    };
  }, [current, matches]);

  const decide = useCallback(
    async (decision: "interested" | "pass") => {
      if (!current || leaving) return;
      setLeaving(decision === "interested" ? "right" : "left");
      api("/api/v1/patients/me/swipes", { method: "POST", json: { trialId: current.trial.id, decision } }).catch(() => {});
      if (decision === "interested") setLiked((n) => n + 1);
      setTimeout(() => {
        setIdx((i) => i + 1);
        setLeaving(null);
        window.scrollTo({ top: 0 });
      }, 220);
    },
    [current, leaving]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") decide("interested");
      if (e.key === "ArrowLeft") decide("pass");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  const restart = async () => {
    await api("/api/v1/patients/me/swipes", { method: "DELETE" });
    setMatches({});
    load();
  };

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!deck) return <Spinner label="Finding studies that fit you…" />;

  if (!current) {
    return (
      <Card className="p-8 text-center max-w-xl mx-auto">
        <h2 className="text-lg font-semibold">You&apos;ve seen every recruiting study</h2>
        <p className="text-sm text-slate-600 mt-1">
          {liked > 0 ? `You saved ${liked} this round. ` : ""}Review saved studies and choose which ones to share your profile with.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={onViewSaved}>Review saved studies</Button>
          <Button variant="secondary" onClick={restart}>
            <RotateCcw className="size-4" /> Start over
          </Button>
        </div>
      </Card>
    );
  }

  // Show the instant rule-based score until the AI score arrives.
  const match = matches[current.trial.id] ?? current.match;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3 text-sm text-slate-500">
        <span>
          Study {idx + 1} of {deck.length}
        </span>
        <span className="hidden sm:inline">← pass · → interested</span>
      </div>
      <Card
        className={
          "p-6 transition-all duration-200 " +
          (leaving === "left" ? "-translate-x-10 -rotate-2 opacity-0" : leaving === "right" ? "translate-x-10 rotate-2 opacity-0" : "")
        }
      >
        <TrialCard trial={current.trial} eligibility={current.eligibility} match={match} />
      </Card>
      <div className="sticky bottom-0 mt-4 py-3 bg-gradient-to-t from-[#f6f7f7] via-[#f6f7f7] flex items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => decide("pass")} className="px-6 py-3" aria-label="Pass">
          <X className="size-5" /> Not for me
        </Button>
        <Button variant="ghost" onClick={() => onAsk(current.trial.id)} aria-label="Ask about this study">
          <MessageCircleQuestion className="size-5" />
        </Button>
        <Button onClick={() => decide("interested")} className="px-6 py-3" aria-label="Interested">
          <Heart className="size-5" /> Interested
        </Button>
      </div>
    </div>
  );
}
