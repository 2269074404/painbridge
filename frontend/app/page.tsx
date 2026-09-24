"use client";

import { useEffect, useState } from "react";
import AuthModal from "@/components/AuthModal";
import CoordinatorApp from "@/components/CoordinatorApp";
import Landing from "@/components/Landing";
import PatientApp from "@/components/PatientApp";
import { ErrorNote, Spinner } from "@/components/ui";
import { api, getToken, setToken } from "@/lib/api";
import type { Meta, Role, User } from "@/lib/types";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErr, setMetaErr] = useState("");
  const [inApp, setInApp] = useState(false);
  const [auth, setAuth] = useState<{ role?: Role } | null>(null);

  useEffect(() => {
    api<Meta>("/api/v1/meta")
      .then(setMeta)
      .catch(() => setMetaErr("Can't reach the PainBridge API. Is the backend running on port 8000?"));
    if (getToken()) {
      api<User>("/api/v1/auth/me")
        .then(setUser)
        .catch(() => setToken(null));
    }
  }, []);

  const enter = (role: Role) => {
    if (user && user.role === role) setInApp(true);
    else setAuth({ role });
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
    setInApp(false);
  };

  if (metaErr) {
    return (
      <div className="max-w-md mx-auto p-8">
        <ErrorNote>{metaErr}</ErrorNote>
      </div>
    );
  }

  if (inApp && user) {
    if (!meta) return <Spinner />;
    return user.role === "patient" ? (
      <PatientApp user={user} meta={meta} onHome={() => setInApp(false)} onSignOut={signOut} />
    ) : (
      <CoordinatorApp user={user} meta={meta} onHome={() => setInApp(false)} onSignOut={signOut} />
    );
  }

  return (
    <>
      <Landing user={user} onEnter={enter} onSignIn={() => setAuth({})} />
      {auth && (
        <AuthModal
          prefillRole={auth.role}
          onClose={() => setAuth(null)}
          onSuccess={(u) => {
            setUser(u);
            setAuth(null);
            setInApp(true);
          }}
        />
      )}
    </>
  );
}
