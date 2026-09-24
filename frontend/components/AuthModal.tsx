"use client";

import { useState } from "react";
import { api, setToken } from "@/lib/api";
import type { Role, User } from "@/lib/types";
import { Button, ErrorNote, Field, Modal, SingleChips, inputCls } from "./ui";

export default function AuthModal({
  prefillRole,
  onClose,
  onSuccess,
}: {
  prefillRole?: Role;
  onClose: () => void;
  onSuccess: (u: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<Role>(prefillRole ?? "patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api<{ token: string; user: User }>(`/api/v1/auth/${mode}`, {
        method: "POST",
        json: mode === "login" ? { email, password } : { email, password, role, legalName: name },
      });
      setToken(res.token);
      onSuccess(res.user);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    setMode("login");
    setEmail(role === "coordinator" ? "coordinator@painbridge.demo" : "patient@painbridge.demo");
    setPassword("demo1234");
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="text-sm text-slate-500">
            {role === "coordinator" ? "Study team access" : "Patient access"} ·{" "}
            <button type="button" className="text-brand-600 hover:underline" onClick={fillDemo}>
              use demo account
            </button>
          </p>
        </div>
        {mode === "signup" && (
          <>
            <Field label="I am">
              <SingleChips
                options={["patient", "coordinator"] as const}
                value={role}
                onChange={(r) => setRole(r)}
              />
            </Field>
            <Field label="Full name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          </>
        )}
        <Field label="Email">
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? 8 : 1} />
        </Field>
        {err && <ErrorNote>{err}</ErrorNote>}
        <Button type="submit" loading={busy} className="w-full">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? "New here? " : "Have an account? "}
          <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </Modal>
  );
}
