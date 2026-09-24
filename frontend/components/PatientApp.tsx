"use client";

import { useEffect, useState } from "react";
import { Bookmark, LineChart, MessagesSquare, NotebookPen, Search, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Meta, Profile, Trial, User } from "@/lib/types";
import AppHeader from "./AppHeader";
import ChatPanel, { type Assistant } from "./ChatPanel";
import MyStudies from "./MyStudies";
import PainDiary from "./PainDiary";
import PainForecast from "./PainForecast";
import PatientOnboarding from "./PatientOnboarding";
import TrialDeck from "./TrialDeck";
import { Button, Card, Chip, Modal, Spinner } from "./ui";

type TabKey = "discover" | "studies" | "diary" | "insights" | "ask" | "profile";

const TABS = [
  { key: "discover", label: "Discover", icon: <Search className="size-4" /> },
  { key: "studies", label: "My studies", icon: <Bookmark className="size-4" /> },
  { key: "diary", label: "Diary", icon: <NotebookPen className="size-4" /> },
  { key: "insights", label: "Forecast & plan", icon: <LineChart className="size-4" /> },
  { key: "ask", label: "Ask", icon: <MessagesSquare className="size-4" /> },
  { key: "profile", label: "Profile", icon: <UserRound className="size-4" /> },
];

export default function PatientApp({ user, meta, onHome, onSignOut }: { user: User; meta: Meta; onHome: () => void; onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>("discover");
  const [assistant, setAssistant] = useState<Assistant>("pain-coach");
  const [askTrial, setAskTrial] = useState<Trial | null>(null);
  const [diaryVersion, setDiaryVersion] = useState(0);

  useEffect(() => {
    api<Profile | null>("/api/v1/patients/me/profile").then(setProfile).catch(() => setProfile(null));
  }, []);

  const ask = (trialId: string) => api<Trial>(`/api/v1/trials/${trialId}`).then(setAskTrial);

  if (profile === undefined) return <Spinner />;
  if (profile === null) {
    return (
      <>
        <AppHeader user={user} onHome={onHome} onSignOut={onSignOut} />
        <PatientOnboarding meta={meta} initial={null} onDone={setProfile} onCancel={onHome} />
      </>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader user={user} tabs={TABS} active={tab} onTab={(k) => setTab(k as TabKey)} onHome={onHome} onSignOut={onSignOut} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "discover" && <TrialDeck onAsk={ask} onViewSaved={() => setTab("studies")} />}
        {tab === "studies" && <MyStudies onAsk={ask} onBrowse={() => setTab("discover")} />}
        {tab === "diary" && <PainDiary meta={meta} onSaved={() => setDiaryVersion((v) => v + 1)} />}
        {tab === "insights" && <PainForecast version={diaryVersion} onGoDiary={() => setTab("diary")} />}
        {tab === "ask" && (
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex gap-2">
              <Chip selected={assistant === "pain-coach"} onClick={() => setAssistant("pain-coach")}>
                Pain Coach
              </Chip>
              <Chip selected={assistant === "trial-guide"} onClick={() => setAssistant("trial-guide")}>
                Trial Guide
              </Chip>
            </div>
            <Card>
              <ChatPanel assistant={assistant} />
            </Card>
          </div>
        )}
        {tab === "profile" && (
          <PatientOnboarding
            meta={meta}
            initial={profile}
            onDone={(p) => {
              setProfile(p);
              setTab("discover");
            }}
            onCancel={() => setTab("discover")}
          />
        )}
      </main>

      {askTrial && (
        <Modal onClose={() => setAskTrial(null)}>
          <div className="flex items-center justify-between px-4 pt-4">
            <div className="font-semibold">Trial Guide</div>
            <Button variant="ghost" size="sm" onClick={() => setAskTrial(null)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
          <ChatPanel assistant="trial-guide" trialId={askTrial.id} trialName={askTrial.shortTitle} height="h-[480px]" />
        </Modal>
      )}
    </div>
  );
}
