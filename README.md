# PainBridge

PainBridge is a two-sided platform for **chronic pain clinical research**. People living with chronic pain get swipe-style trial discovery with transparent eligibility, a daily pain diary that powers a **personal pain forecast**, and an AI-assisted **self-management plan**. Study teams get a pre-screened referral pipeline with AI briefs, contact notes, screening scheduling, diary-based retention monitoring, and a representation snapshot of who is referred vs. enrolled.

It applies the Trustail (PawMatch) pattern of *fit gaps to plan for, not gatekeeping* to trial recruitment. Participation barriers such as travel, work schedule, caregiving, and language never lower a patient's match. Instead they are paired with the supports a study offers.

## Features

**Patients**
- 4-step health profile: conditions, NRS pain scores, interference, sleep, PHQ-2/GAD-2, treatments and opioid MME, comorbidities, study preferences, participation barriers
- Trial deck with a **rule-based eligibility checklist** (met / not met / confirmed at screening), distance to the nearest site, and an AI fit score with reasons and barrier-to-support pairings
- Per-study consent before anything is shared, plus a referral status tracker
- Daily check-in (pain, sleep, stress, mood, activity, triggers, rescue meds) with a 28-day heatmap
- **Pain forecast:** 7-day forecast with an 80% interval, flare-day probability, "what if" scenarios, personal pain drivers, and a model card with held-out accuracy
- Weekly **pain management plan** covering pacing, sleep, stress, a flare plan, what to discuss with your care team, and red flags
- Chat assistants: **Trial Guide** (placebo, consent, rights, visits) and **Pain Coach** (self-management), with a hard-coded crisis check that routes to 988

**Study coordinators**
- Referral pipeline: New → Pre-screening → Contacted → Screening visit scheduled → Enrolled / Screen fail / Withdrawn
- AI **pre-screen brief** listing what to verify and which supports to offer
- Contact notes with an AI summary, a status timeline, and screening visit scheduling
- Shared pain diary with adherence, trend, and **retention risk**
- Enrollment funnel per study and a **representation snapshot** (sex, age, travel radius) of referred vs. enrolled
- Create studies with structured criteria and an AI-drafted plain-language summary

## How the pieces work

| Piece | Approach |
|---|---|
| Eligibility | Deterministic rules in `backend/app/domain.py`. The LLM never decides who qualifies. |
| Fit score | LLM via the Duke AI Gateway, capped at 40 when eligibility is "unlikely", with an equity-constrained prompt. Falls back to a transparent heuristic. |
| Pain forecast | `backend/app/forecast.py`: ridge regression of next-day pain on lagged pain, sleep, stress, mood, activity, overexertion, and rescue meds. The population model is trained on a **synthetic** cohort (240 simulated patients × 90 days). Patients with ≥21 diary days get a personal model with a Gaussian prior centred on the population coefficients. |
| Flare risk | P(pain ≥ personal baseline + 2) under a normal predictive distribution whose variance grows with the forecast horizon. |
| Drivers | For each factor, a small model adjusted for yesterday's pain, so correlated inputs (e.g. sleep hours vs. quality) can't flip signs. |

Held-out results on simulated patients: next-day MAE is **0.67** for the model, compared with 0.74 for "same as yesterday" and 0.92 for the 7-day mean. Personalization lowers MAE from 0.669 to 0.645. Real-world accuracy is unknown until the model is validated on clinical data.

## Tech stack

**Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts, lucide-react
**Backend:** FastAPI, Motor (MongoDB), Pydantic v2, JWT (PyJWT + argon2), NumPy
**AI:** OpenAI SDK → Duke AI Gateway (LiteLLM), default model `Mistral on-site` (free). A startup probe and circuit breaker switch to deterministic fallbacks when the gateway is unreachable.

## Running locally

```bash
# Backend (http://localhost:8000)
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # add LITELLM_TOKEN; leave MONGODB_URI empty for in-memory demo mode
python main.py

# Frontend (http://localhost:3000)
cd frontend
npm install
npm run dev
```

With `MONGODB_URI` empty, the backend runs on an in-memory database and reseeds demo data on every restart. Demo logins (password `demo1234`):
- `patient@painbridge.demo`: profile plus 60 days of diary
- `coordinator@painbridge.demo`: 8 studies and 13 referrals

Tests: `cd backend && python -m pytest -q tests` (end-to-end, in-memory, AI fallbacks).

## Deploying (same setup as Trustail)

The **frontend is hosted on Ember AI** and the **backend on Render**. The repo follows the Ember template layout: a root `package.json` workspace pointing at `frontend/`, `public/error-capture.js`, and the route-tracking script in `app/layout.tsx`, with `output: "standalone"`.

1. **Backend (Render):** go to **New → Blueprint**, pick this repo, and click **Apply** (`render.yaml`). Enter:
   - `LITELLM_TOKEN`: Duke AI Gateway key
   - `MONGODB_URI`: Atlas connection string, stored in the `painbridge` database (leave blank for in-memory demo mode)
   - `CORS_ORIGINS`: your Ember app URL(s), comma-separated

   Note the API URL, e.g. `https://painbridge-api.onrender.com`.
2. **Frontend (Ember AI):** open the repo in Ember and set `NEXT_PUBLIC_API_URL` to the Render API URL. It's read at build time, so rebuild after changing it.

The backend uses Python 3.12.7 (`runtime.txt` / `PYTHON_VERSION`). On Atlas, allow Render's outbound IPs, or `0.0.0.0/0` for a demo, under Network Access.

## Project structure

```
backend/app/
  domain.py      vocabularies + rule-based eligibility engine
  forecast.py    synthetic cohort, ridge / personalized models, forecast, drivers, adherence
  ai.py          gateway client, prompts, crisis check, fallbacks
  seed.py        fictional trials, sites, patients
  routes/        auth, patients (matching/referrals), diary, trials, coordinator, chat
frontend/components/
  TrialDeck, TrialCard, MyStudies, PatientOnboarding, PainDiary, PainForecast, ChatPanel
  CoordinatorApp, ReferralDetail, AddTrial
```

## Limitations and safety

- **Research prototype.** All trials, sponsors, sites, and patients are fictional. This is not a medical device, and the forecasts are not clinical advice.
- Not HIPAA-compliant as built. Real deployment would need a BAA-covered database and LLM, audit logging, IRB-approved consent language, and encryption at rest.
- Only de-identified structured fields are sent to the LLM. Names and emails never are.
- The forecasting model is trained on simulated data and must be validated prospectively before any real use.

## Author

Built by Jiaoni Li, Ph.D. candidate in Biomedical Engineering, Duke University.
