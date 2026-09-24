"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { Button, Markdown, cx } from "./ui";

export type Assistant = "trial-guide" | "pain-coach";

const INFO: Record<Assistant, { name: string; intro: string; starters: string[] }> = {
  "trial-guide": {
    name: "Trial Guide",
    intro: "Ask anything about clinical research: placebo, consent, visits, your rights. There's no pressure to join anything.",
    starters: ["What does placebo mean for my pain care?", "Can I leave a study once I start?", "What should I ask the coordinator?"],
  },
  "pain-coach": {
    name: "Pain Coach",
    intro: "Practical, evidence-based self-management: pacing, sleep, stress, and flare plans, tuned to your diary.",
    starters: ["I'm heading into a flare. What should I do today?", "How do I pace without losing a whole day?", "Tips for sleeping with pain?"],
  },
};

export default function ChatPanel({ assistant, trialId, trialName, height = "h-[520px]" }: { assistant: Assistant; trialId?: string; trialName?: string; height?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const info = INFO[assistant];

  useEffect(() => {
    setMessages([]);
  }, [assistant, trialId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api<{ reply: string }>(`/api/v1/chat/${assistant}`, { method: "POST", json: { messages: next, trialId } });
      setMessages([...next, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `Sorry, something went wrong: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx("flex flex-col", height)}>
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {info.intro}
              {trialName && (
                <>
                  {" "}
                  I have the details of <strong>{trialName}</strong>.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {info.starters.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full bg-brand-50 text-brand-700 px-3 py-1.5 text-xs hover:bg-brand-100">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100")}>
              {m.role === "user" ? m.content : <Markdown>{m.content}</Markdown>}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400 px-1">{info.name} is typing…</div>}
        <div ref={endRef} />
      </div>
      <form
        className="border-t border-slate-200 p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder={`Message ${info.name}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Message"
        />
        <Button type="submit" disabled={!input.trim()} loading={busy} aria-label="Send">
          {!busy && <Send className="size-4" />}
        </Button>
      </form>
      <p className="px-3 pb-2 text-[10px] text-slate-400">AI assistant, not a clinician. In a crisis, call or text 988.</p>
    </div>
  );
}
