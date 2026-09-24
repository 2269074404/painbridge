"""Pain forecasting from daily diary entries.

Model: next-day pain (0-10 NRS) regressed on the previous day's pain, 7-day mean pain,
sleep, stress, mood, activity, overexertion and rescue-medication use.

- A population ridge model is trained at first use on a SYNTHETIC cohort (no real
  patient data), with a held-out evaluation against naive baselines (see model_card()).
- Once a patient has >= PERSONAL_MIN_ROWS usable diary days, a personal model is fit
  with a Gaussian prior centred on the population coefficients (ridge shrinkage toward
  w_pop), so sparse diaries lean on the population and rich diaries personalize.
- Forecasts roll forward 7 days assuming the patient's recent routine continues;
  flare probability is P(pain >= personal baseline + 2) under a normal predictive.

Associations here are statistical, not causal, and this is not a medical device.
"""

from __future__ import annotations
import math
from datetime import date, timedelta
from functools import lru_cache
import numpy as np

FEATURES = [
    "pain_lag1",
    "pain_mean7",
    "sleep_hours",
    "sleep_quality",
    "stress",
    "mood",
    "activity_30",
    "overexertion",
    "rescue_meds",
]

MODIFIABLE = {
    "sleep_hours": ("Sleep duration", "hour(s) of sleep"),
    "sleep_quality": ("Sleep quality", "points of sleep quality"),
    "stress": ("Stress", "points of stress"),
    "mood": ("Mood", "points of mood"),
    "activity_30": ("Daily activity", "x 30 min of activity"),
    "overexertion": ("Overexertion days", "overexertion day"),
}

OVEREXERTION_MIN = 90
MIN_ENTRIES = 7
PERSONAL_MIN_ROWS = 21
PERSONAL_PRIOR_STRENGTH = 15.0


# ---------------------------------------------------------------- synthetic data

def simulate_patient(rng: np.random.Generator, days: int = 90, start: date | None = None,
                     baseline: float | None = None) -> list[dict]:
    """Generate a realistic-looking synthetic pain diary with person-specific sensitivities."""
    start = start or date.today() - timedelta(days=days)
    b = baseline if baseline is not None else rng.uniform(3.0, 7.0)
    phi = rng.uniform(0.35, 0.65)
    s_sleep = rng.uniform(0.15, 0.55)
    s_stress = rng.uniform(0.05, 0.25)
    s_over = rng.uniform(0.4, 1.4)
    s_act = rng.uniform(0.0, 0.3)
    sleep_mean = rng.normal(6.8, 0.6)
    act_base = rng.uniform(10, 50)

    pain, stress, flare = b, 5.0, 0.0
    sleep, act, over = sleep_mean, act_base, 0
    out: list[dict] = []
    for d in range(days):
        if rng.random() < 0.03:
            flare += 2.5
        pain = (
            b
            + phi * (pain - b)
            - s_sleep * (sleep - 7.0)
            + s_stress * (stress - 5.0)
            + s_over * over
            - s_act * (min(act, 60) - act_base) / 30
            + flare
            + rng.normal(0, 0.6)
        )
        pain = float(np.clip(pain, 0, 10))
        flare *= 0.4
        stress = float(np.clip(5 + 0.6 * (stress - 5) + rng.normal(0, 1.3), 0, 10))
        over = int(rng.random() < 0.08)
        act = float(rng.uniform(90, 150) if over else max(0.0, rng.normal(act_base, 20)))
        sleep = float(np.clip(sleep_mean - 0.15 * (pain - b) + rng.normal(0, 1.0), 3, 10))
        pain_i = int(round(pain))
        sq = int(np.clip(round(5 + 1.2 * (sleep - 6.8) - 0.3 * (pain - b) + rng.normal(0, 1)), 0, 10))
        mood = int(np.clip(round(7 - 0.4 * (pain - 3) - 0.3 * (stress - 5) + rng.normal(0, 1)), 0, 10))
        triggers = []
        if sleep < 5.5:
            triggers.append("Poor sleep")
        if stress > 7:
            triggers.append("Stress")
        if over:
            triggers.append("Overexertion")
        if rng.random() < 0.05:
            triggers.append("Weather change")
        out.append({
            "date": (start + timedelta(days=d)).isoformat(),
            "pain": pain_i,
            "sleepHours": round(sleep * 2) / 2,
            "sleepQuality": sq,
            "stress": int(round(stress)),
            "mood": mood,
            "activityMinutes": int(round(act / 5) * 5),
            "rescueMeds": bool(pain_i >= b + 2 and rng.random() < 0.7),
            "triggers": triggers,
            "notes": "",
        })
    return out


# ---------------------------------------------------------------- features

def _day_features(entry: dict, pain_hist: list[float]) -> list[float]:
    act = float(entry.get("activityMinutes") or 0)
    return [
        float(entry.get("pain") or 0),
        float(np.mean(pain_hist[-7:])),
        float(entry.get("sleepHours") or 7),
        float(entry.get("sleepQuality") if entry.get("sleepQuality") is not None else 5),
        float(entry.get("stress") if entry.get("stress") is not None else 5),
        float(entry.get("mood") if entry.get("mood") is not None else 5),
        act / 30.0,
        1.0 if act >= OVEREXERTION_MIN else 0.0,
        1.0 if entry.get("rescueMeds") else 0.0,
    ]


def build_rows(entries: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Rows of (features from day t-1) -> pain on day t, skipping gaps > 2 days."""
    es = sorted(entries, key=lambda e: e["date"])
    X, y, hist = [], [], []
    for prev, cur in zip(es, es[1:]):
        hist.append(float(prev.get("pain") or 0))
        gap = (date.fromisoformat(cur["date"]) - date.fromisoformat(prev["date"])).days
        if gap < 1 or gap > 2:
            continue
        X.append([1.0] + _day_features(prev, hist))
        y.append(float(cur.get("pain") or 0))
    return np.array(X).reshape(-1, len(FEATURES) + 1), np.array(y)


def _ridge(X: np.ndarray, y: np.ndarray, lam: float, prior: np.ndarray | None = None) -> np.ndarray:
    p = X.shape[1]
    penalty = lam * np.eye(p)
    penalty[0, 0] = 0.0  # never shrink the intercept
    w0 = prior if prior is not None else np.zeros(p)
    return np.linalg.solve(X.T @ X + penalty, X.T @ y + penalty @ w0)


# ---------------------------------------------------------------- population model

@lru_cache(maxsize=1)
def _population() -> dict:
    rng = np.random.default_rng(20260924)
    cohort = [simulate_patient(rng, days=90) for _ in range(300)]
    train, test = cohort[:240], cohort[240:]

    Xs, ys = zip(*(build_rows(p) for p in train))
    X, y = np.vstack(Xs), np.concatenate(ys)
    w = _ridge(X, y, lam=1.0)
    sigma = float(np.std(y - X @ w))

    Xt_s, yt_s = zip(*(build_rows(p) for p in test))
    Xt, yt = np.vstack(Xt_s), np.concatenate(yt_s)
    pred = np.clip(Xt @ w, 0, 10)

    # Personalized evaluation: fit each test patient on their first 60 days, score the rest.
    pers_err, pop_err = [], []
    for p in test:
        Xp, yp = build_rows(p)
        k = 59
        wp = _ridge(Xp[:k], yp[:k], PERSONAL_PRIOR_STRENGTH, prior=w)
        pers_err.extend(np.abs(np.clip(Xp[k:] @ wp, 0, 10) - yp[k:]))
        pop_err.extend(np.abs(np.clip(Xp[k:] @ w, 0, 10) - yp[k:]))

    return {
        "w": w,
        "sigma": sigma,
        "card": {
            "trainedOn": "Synthetic cohort: 240 simulated patients x 90 diary days (no real patient data)",
            "testSet": "60 held-out simulated patients",
            "target": "Next-day pain, 0-10 numeric rating scale",
            "features": FEATURES,
            "maeModel": round(float(np.mean(np.abs(pred - yt))), 3),
            "maePersistence": round(float(np.mean(np.abs(Xt[:, 1] - yt))), 3),
            "maeMean7": round(float(np.mean(np.abs(Xt[:, 2] - yt))), 3),
            "maePopulationLast30": round(float(np.mean(pop_err)), 3),
            "maePersonalizedLast30": round(float(np.mean(pers_err)), 3),
            "residualSD": round(sigma, 3),
            "coefficients": {n: round(float(v), 3) for n, v in zip(["intercept"] + FEATURES, w)},
            "limitations": [
                "Trained and evaluated on simulated data; real-world accuracy is unknown until validated on a clinical cohort.",
                "Coefficients are associations, not causal effects.",
                "Not a medical device; not for diagnosis or treatment decisions.",
            ],
        },
    }


def model_card() -> dict:
    return _population()["card"]


# ---------------------------------------------------------------- forecasting

def _phi(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _fit_for(entries: list[dict]) -> tuple[np.ndarray, float, str, int]:
    pop = _population()
    X, y = build_rows(entries)
    if len(y) >= PERSONAL_MIN_ROWS:
        w = _ridge(X, y, PERSONAL_PRIOR_STRENGTH, prior=pop["w"])
        resid = float(np.std(y - X @ w))
        # Blend residual SD toward population so short diaries don't look overconfident.
        n = len(y)
        sigma = math.sqrt((n * resid**2 + 20 * pop["sigma"] ** 2) / (n + 20))
        return w, sigma, "personalized", n
    return pop["w"], pop["sigma"], "population", len(y)


def forecast(entries: list[dict], horizon: int = 7) -> dict:
    es = sorted(entries, key=lambda e: e["date"])
    if len(es) < MIN_ENTRIES:
        return {"ready": False, "entriesNeeded": MIN_ENTRIES - len(es), "history": _history(es)}

    w, sigma, kind, n_rows = _fit_for(es)
    recent = es[-14:]
    pains = [float(e.get("pain") or 0) for e in es]
    baseline = float(np.median(pains[-28:]))
    threshold = int(min(10, math.ceil(baseline + 2)))

    typical = {
        "sleepHours": float(np.mean([e.get("sleepHours") or 7 for e in recent])),
        "sleepQuality": float(np.mean([e.get("sleepQuality") or 5 for e in recent])),
        "stress": float(np.mean([e.get("stress") or 5 for e in recent])),
        "mood": float(np.mean([e.get("mood") or 5 for e in recent])),
        "activityMinutes": float(np.mean([e.get("activityMinutes") or 0 for e in recent])),
    }
    over_rate = float(np.mean([(e.get("activityMinutes") or 0) >= OVEREXERTION_MIN for e in recent]))
    rescue_rate = float(np.mean([bool(e.get("rescueMeds")) for e in recent]))

    persistence = float(np.clip(w[1] + w[2] / 7, 0, 0.95))
    last = es[-1]
    hist = list(pains)
    lag_entry = dict(last)
    out, no_flare = [], 1.0
    start = date.fromisoformat(last["date"])
    for k in range(1, horizon + 1):
        x = np.array([1.0] + _day_features(lag_entry, hist))
        if k > 1:
            # Future days: use expected rates rather than assuming none happen.
            x[8] = over_rate
            x[9] = rescue_rate
        mu = float(np.clip(x @ w, 0, 10))
        sd = sigma * math.sqrt(sum(persistence ** (2 * i) for i in range(k)))
        p_flare = 1 - _phi((threshold - 0.5 - mu) / sd)
        no_flare *= 1 - p_flare
        d = start + timedelta(days=k)
        out.append({
            "date": d.isoformat(),
            "mean": round(mu, 2),
            "low": round(max(0.0, mu - 1.28 * sd), 2),
            "high": round(min(10.0, mu + 1.28 * sd), 2),
            "flareProb": round(p_flare, 3),
        })
        hist.append(mu)
        lag_entry = {**typical, "pain": mu, "rescueMeds": False, "date": d.isoformat()}

    return {
        "ready": True,
        "model": kind,
        "trainingDays": n_rows,
        "baseline": round(baseline, 1),
        "flareThreshold": threshold,
        "history": _history(es),
        "forecast": out,
        "flareRisk7d": round(1 - no_flare, 3),
        "scenarios": _scenarios(w, last, pains),
        "drivers": _drivers(es),
        "residualSD": round(sigma, 2),
    }


def _history(es: list[dict]) -> list[dict]:
    return [{"date": e["date"], "pain": e.get("pain")} for e in es[-28:]]


def _scenarios(w: np.ndarray, last: dict, pains: list[float]) -> list[dict]:
    def pred(entry: dict) -> float:
        return float(np.clip(np.array([1.0] + _day_features(entry, pains)) @ w, 0, 10))

    base = pred(last)
    act = float(last.get("activityMinutes") or 0)
    options = [
        ("Sleep 1 hour more tonight", {"sleepHours": (last.get("sleepHours") or 7) + 1,
                                        "sleepQuality": min(10, (last.get("sleepQuality") or 5) + 1)}),
        ("Bring stress down 2 points", {"stress": max(0, (last.get("stress") or 5) - 2)}),
    ]
    if act >= OVEREXERTION_MIN:
        options.append(("Pace activity to about 45 min", {"activityMinutes": 45}))
    else:
        options.append(("Add a 20-min gentle walk", {"activityMinutes": min(act + 20, OVEREXERTION_MIN - 5)}))
    out = []
    for label, change in options:
        p = pred({**last, **change})
        out.append({"label": label, "predicted": round(p, 2), "delta": round(p - base, 2)})
    return [{"label": "If today looks like yesterday", "predicted": round(base, 2), "delta": 0.0}] + out


def _drivers(es: list[dict]) -> list[dict]:
    """Per-factor association with next-day pain, adjusting only for yesterday's pain.

    One small model per factor (not the joint forecast model), so correlated inputs like
    sleep hours and sleep quality can't flip each other's signs in the patient-facing list.
    """
    X, y = build_rows(es)
    if len(y) < 14:
        return []
    out = []
    for name, (label, unit) in MODIFIABLE.items():
        j = FEATURES.index(name) + 1
        sd = float(np.std(X[:, j]))
        if name == "overexertion":
            sd = 1.0 if X[:, j].sum() >= 2 else 0.0
        if sd < 1e-6:
            continue
        Xj = X[:, [0, 1, j]]
        coef = _ridge(Xj, y, lam=1.0)[2]
        effect = float(coef * sd)
        worse = effect > 0
        out.append({
            "factor": name,
            "label": label,
            "effect": round(effect, 2),
            "direction": "raises" if worse else "lowers",
            "explanation": (
                f"A typical day-to-day swing ({sd:.1f} {unit}) in {label.lower()} is associated with "
                f"{abs(effect):.2f} points {'higher' if worse else 'lower'} pain the next day."
                if name != "overexertion"
                else f"Days with {OVEREXERTION_MIN}+ min of activity are followed by "
                     f"{abs(effect):.2f} points {'higher' if worse else 'lower'} pain."
            ),
        })
    out.sort(key=lambda d: abs(d["effect"]), reverse=True)
    return out


# ---------------------------------------------------------------- coordinator summaries

def diary_summary(entries: list[dict], today: date | None = None) -> dict:
    """Adherence and trend summary used for trial ePRO monitoring and retention risk."""
    today = today or date.today()
    es = sorted(entries, key=lambda e: e["date"])
    last14 = [e for e in es if (today - date.fromisoformat(e["date"])).days < 14]
    days_since = (today - date.fromisoformat(es[-1]["date"])).days if es else None
    pains = [e.get("pain") or 0 for e in es[-28:]]
    slope = 0.0
    if len(pains) >= 7:
        slope = float(np.polyfit(np.arange(len(pains)), pains, 1)[0]) * 7
    adherence = round(len(last14) / 14, 2)
    if days_since is None or days_since > 5 or adherence < 0.4:
        retention = "High"
    elif days_since > 2 or adherence < 0.7:
        retention = "Medium"
    else:
        retention = "Low"
    return {
        "entries": len(es),
        "adherence14d": adherence,
        "daysSinceLastEntry": days_since,
        "avgPain14d": round(float(np.mean([e.get("pain") or 0 for e in last14])), 1) if last14 else None,
        "weeklyTrend": round(slope, 2),
        "retentionRisk": retention,
    }
