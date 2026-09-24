"""Demo data. Every trial, site, sponsor and patient here is FICTIONAL."""

from datetime import date, timedelta
import numpy as np
from . import forecast
from .ai import _heuristic_match
from .db import get_db
from .domain import evaluate_eligibility
from .routes import now
from .security import hash_password

DEMO_PASSWORD = "demo1234"

TRIALS = [
    {
        "shortTitle": "NaV1.8 blocker for low back pain",
        "title": "A randomized, placebo-controlled study of an oral NaV1.8 sodium-channel blocker (PBX-118) in chronic low back pain",
        "sponsor": "Demo Therapeutics (fictional)",
        "phase": "Phase 2",
        "interventionType": "Medication",
        "intervention": "Oral non-opioid NaV1.8 channel blocker (PBX-118), twice daily",
        "summary": "This study is testing whether a new non-opioid pill that quiets pain-sensing nerves can reduce chronic low back pain. Half of participants get the study pill and half get a placebo for 12 weeks.",
        "whatToExpect": ["8 visits over 14 weeks (3 can be video visits)", "A 1-minute daily pain diary on your phone",
                         "50% chance of placebo; your usual care continues", "Up to $900 plus travel reimbursement"],
        "placebo": True, "durationWeeks": 14, "visits": 8, "remoteVisits": True, "travelSupport": True,
        "compensation": "Up to $900",
        "sites": [{"name": "Triangle Pain Research Center", "city": "Durham, NC"},
                  {"name": "Capital Spine Research", "city": "Raleigh, NC"},
                  {"name": "James River Clinical Research", "city": "Richmond, VA"}],
        "targetEnrollment": 120, "enrolled": 41,
        "criteria": {"minAge": 18, "maxAge": 75, "conditions": ["Chronic low back pain"], "minAvgPain": 5,
                     "minDurationMonths": 6, "maxOpioidMME": 30,
                     "excludeComorbidities": ["Kidney disease", "Liver disease", "Pregnant or planning pregnancy", "Current substance use disorder"],
                     "requiresPlacebo": True,
                     "otherCriteria": ["No back surgery in the past 6 months", "Stable pain medications for 30 days"]},
    },
    {
        "shortTitle": "Digital CBT app for fibromyalgia",
        "title": "Remote trial of a smartphone-delivered cognitive behavioral therapy program vs. a digital education control for fibromyalgia",
        "sponsor": "Demo Digital Health (fictional)",
        "phase": "N/A (behavioral)",
        "interventionType": "Behavioral / digital",
        "intervention": "12-week app-based CBT for chronic pain, 15 min/day",
        "summary": "This fully remote study is testing whether a daily 15-minute app program based on cognitive behavioral therapy helps people with fibromyalgia function better. Some participants use a comparison education app.",
        "whatToExpect": ["All 3 check-ins are by video", "15 minutes a day in the app for 12 weeks",
                         "Weekly symptom questionnaires", "$300 in gift cards"],
        "placebo": True, "durationWeeks": 12, "visits": 3, "remoteVisits": True, "fullyRemote": True, "travelSupport": False,
        "compensation": "$300",
        "sites": [{"name": "Virtual site (NC/VA residents)", "city": "Durham, NC"}],
        "targetEnrollment": 200, "enrolled": 118,
        "criteria": {"minAge": 18, "maxAge": 80, "conditions": ["Fibromyalgia"], "minAvgPain": 4, "minDurationMonths": 3,
                     "excludeTreatments": ["CBT / pain psychology"],
                     "otherCriteria": ["Owns a smartphone", "Not currently in CBT for pain"]},
    },
    {
        "shortTitle": "Spinal cord stimulation for diabetic nerve pain",
        "title": "High-frequency spinal cord stimulation plus conventional care vs. conventional care alone for painful diabetic peripheral neuropathy",
        "sponsor": "Demo Neuromodulation (fictional)",
        "phase": "N/A (device)",
        "interventionType": "Device / neuromodulation",
        "intervention": "Implanted 10 kHz spinal cord stimulator",
        "summary": "This study compares an implanted spinal cord stimulator plus usual care to usual care alone for painful diabetic neuropathy in the feet and legs. There is no placebo, and the usual-care group can cross over after 6 months.",
        "whatToExpect": ["12 visits over 12 months", "A short outpatient trial period before permanent implant",
                         "Option to cross over after 6 months", "Up to $1,200 plus travel and lodging"],
        "placebo": False, "durationWeeks": 52, "visits": 12, "remoteVisits": False, "travelSupport": True,
        "compensation": "Up to $1,200",
        "sites": [{"name": "Triangle Pain Research Center", "city": "Durham, NC"},
                  {"name": "Queen City Neuro Research", "city": "Charlotte, NC"},
                  {"name": "Peachtree Clinical Trials", "city": "Atlanta, GA"}],
        "targetEnrollment": 80, "enrolled": 22,
        "criteria": {"minAge": 22, "maxAge": 80, "conditions": ["Diabetic peripheral neuropathy"], "minAvgPain": 5,
                     "minDurationMonths": 12, "maxOpioidMME": 120,
                     "excludeComorbidities": ["Active cancer", "Pregnant or planning pregnancy"],
                     "excludeTreatments": ["Spinal cord stimulator"],
                     "otherCriteria": ["HbA1c ≤ 10%", "Not a candidate for or declined MRI-incompatible devices"]},
    },
    {
        "shortTitle": "Nerve ablation vs. steroid shot for knee arthritis",
        "title": "Cooled radiofrequency ablation of the genicular nerves vs. intra-articular corticosteroid for knee osteoarthritis pain",
        "sponsor": "Demo Orthopedic Research Network (fictional)",
        "phase": "Phase 4",
        "interventionType": "Procedure / injection",
        "intervention": "Genicular nerve radiofrequency ablation",
        "summary": "This study compares two outpatient procedures for knee arthritis pain: heat treatment of the small nerves around the knee, or a steroid injection into the joint.",
        "whatToExpect": ["6 visits over 24 months", "One outpatient procedure (about 1 hour)",
                         "Walking and function tests at each visit", "$600"],
        "placebo": False, "durationWeeks": 24, "visits": 6, "remoteVisits": False, "travelSupport": False,
        "compensation": "$600",
        "sites": [{"name": "Piedmont Joint Research", "city": "Chapel Hill, NC"},
                  {"name": "Gate City Orthopedic Research", "city": "Greensboro, NC"},
                  {"name": "Harbor Clinical Research", "city": "Baltimore, MD"}],
        "targetEnrollment": 90, "enrolled": 57,
        "criteria": {"minAge": 50, "maxAge": 85, "conditions": ["Knee osteoarthritis"], "minAvgPain": 5, "minDurationMonths": 6,
                     "excludeTreatments": ["Injections / nerve blocks"],
                     "otherCriteria": ["X-ray confirmed knee OA (KL grade 2-4)", "No knee injection in the past 3 months"]},
    },
    {
        "shortTitle": "Graded exercise + pain education for neck pain",
        "title": "Supervised graded exercise with pain neuroscience education for chronic neck pain: a pragmatic trial",
        "sponsor": "Demo Rehabilitation Collaborative (fictional)",
        "phase": "N/A (behavioral)",
        "interventionType": "Physical / exercise",
        "intervention": "Twice-weekly supervised exercise + pain neuroscience education",
        "summary": "This study tests whether a structured, gradually increasing exercise program paired with education about how pain works helps people with long-term neck pain.",
        "whatToExpect": ["16 sessions over 8 weeks, with evening slots available", "Home exercises (10 min/day)",
                         "Follow-up at 3 and 6 months", "$400"],
        "placebo": False, "durationWeeks": 10, "visits": 16, "remoteVisits": False, "travelSupport": False,
        "compensation": "$400",
        "sites": [{"name": "Capital Spine Research", "city": "Raleigh, NC"},
                  {"name": "Triangle Pain Research Center", "city": "Durham, NC"},
                  {"name": "Three Rivers Rehab Research", "city": "Pittsburgh, PA"}],
        "targetEnrollment": 150, "enrolled": 64,
        "criteria": {"minAge": 18, "maxAge": 70, "conditions": ["Chronic neck pain"], "minAvgPain": 3, "minDurationMonths": 3,
                     "otherCriteria": ["No neck surgery", "Cleared for moderate exercise"]},
    },
    {
        "shortTitle": "Anti-CGRP antibody for chronic migraine",
        "title": "A phase 3 study of a quarterly anti-CGRP monoclonal antibody in chronic migraine with medication overuse",
        "sponsor": "Demo Biologics (fictional)",
        "phase": "Phase 3",
        "interventionType": "Medication",
        "intervention": "Anti-CGRP monoclonal antibody, injection every 12 weeks",
        "summary": "This study is testing whether a preventive injection given every three months reduces the number of migraine days for people with chronic migraine who also use a lot of acute headache medicine.",
        "whatToExpect": ["7 visits over 24 weeks", "Daily headache diary", "2 in 3 chance of the active drug", "Up to $1,000"],
        "placebo": True, "durationWeeks": 24, "visits": 7, "remoteVisits": False, "travelSupport": True,
        "compensation": "Up to $1,000",
        "sites": [{"name": "Back Bay Headache Research", "city": "Boston, MA"},
                  {"name": "Hudson Neurology Research", "city": "New York, NY"},
                  {"name": "Triangle Pain Research Center", "city": "Durham, NC"}],
        "targetEnrollment": 300, "enrolled": 211,
        "criteria": {"minAge": 18, "maxAge": 65, "conditions": ["Chronic migraine"], "minDurationMonths": 12,
                     "excludeComorbidities": ["Cardiovascular disease", "Pregnant or planning pregnancy"],
                     "requiresPlacebo": True,
                     "otherCriteria": ["15+ headache days per month", "Not on another CGRP medicine"]},
    },
    {
        "shortTitle": "Low-dose naltrexone for fibromyalgia & CRPS",
        "title": "Low-dose naltrexone vs. placebo for fibromyalgia and complex regional pain syndrome",
        "sponsor": "Demo Academic Consortium (fictional)",
        "phase": "Phase 2",
        "interventionType": "Medication",
        "intervention": "Low-dose naltrexone 4.5 mg nightly",
        "summary": "This study is testing whether a very low nightly dose of an existing medicine, naltrexone, can reduce widespread pain. It is not compatible with opioid pain medicines.",
        "whatToExpect": ["6 visits over 16 weeks (4 can be remote)", "Daily pain diary",
                         "50% chance of placebo", "$500"],
        "placebo": True, "durationWeeks": 16, "visits": 6, "remoteVisits": True, "travelSupport": True,
        "compensation": "$500",
        "sites": [{"name": "Puget Sound Pain Research", "city": "Seattle, WA"},
                  {"name": "Bay Area Clinical Research", "city": "San Francisco, CA"},
                  {"name": "Tar River Community Research Clinic", "city": "Rocky Mount, NC"}],
        "targetEnrollment": 100, "enrolled": 33,
        "criteria": {"minAge": 18, "maxAge": 75, "conditions": ["Fibromyalgia", "CRPS"], "minAvgPain": 4, "minDurationMonths": 6,
                     "maxOpioidMME": 0, "excludeTreatments": ["Opioids"],
                     "excludeComorbidities": ["Liver disease", "Pregnant or planning pregnancy"],
                     "requiresPlacebo": True,
                     "otherCriteria": ["No opioid use in the past 14 days"]},
    },
    {
        "shortTitle": "Pain after surgery: 6-month diary study",
        "title": "Observational study of pain trajectories and predictors of chronic post-surgical pain",
        "sponsor": "Demo Outcomes Research Group (fictional)",
        "phase": "Observational",
        "interventionType": "Behavioral / digital",
        "intervention": "No treatment. Daily pain diary and a wearable activity tracker",
        "summary": "No treatment is given. This study follows people who still have pain months after surgery, using a daily diary and an activity tracker, to learn who recovers and why.",
        "whatToExpect": ["2 visits (start and 6 months); everything else from home", "1-minute daily diary",
                         "Wear a wrist activity tracker", "$150 and you keep the tracker"],
        "placebo": False, "durationWeeks": 26, "visits": 2, "remoteVisits": True, "travelSupport": True,
        "compensation": "$150 + tracker",
        "sites": [{"name": "Tar River Community Research Clinic", "city": "Rocky Mount, NC"},
                  {"name": "Triangle Pain Research Center", "city": "Durham, NC"}],
        "targetEnrollment": 400, "enrolled": 176,
        "criteria": {"minAge": 18, "maxAge": 85, "conditions": ["Chronic post-surgical pain", "Chronic low back pain", "Knee osteoarthritis"],
                     "minAvgPain": 3, "minDurationMonths": 3,
                     "otherCriteria": ["Surgery 3-24 months ago"]},
    },
]

DEMO_PROFILE = {
    "age": 44, "sex": "Female", "city": "Durham, NC", "travelMiles": 25,
    "painConditions": ["Chronic low back pain", "Fibromyalgia"], "primaryCondition": "Chronic low back pain",
    "painDurationMonths": 36, "avgPain": 6, "worstPain": 8, "interference": 6, "sleepQuality": 4,
    "phq2": 2, "gad2": 3, "currentTreatments": ["NSAIDs", "Gabapentinoids", "Physical therapy"],
    "dailyOpioidMME": 0, "comorbidities": ["Anxiety"],
    "interventionPrefs": ["Medication", "Behavioral / digital", "Physical / exercise"],
    "placeboOk": "Unsure", "visitAvailability": ["Evenings", "Weekends"],
    "barriers": ["Work schedule", "Caregiving"], "preferredLanguage": "English",
}

FIRST = ["Maya", "Luis", "Grace", "Darnell", "Priya", "Tom", "Aisha", "Ken", "Rosa", "Walter", "Mei", "Andre"]
LAST = ["Okafor", "Hernandez", "Kim", "Brooks", "Patel", "Nguyen", "Rahman", "Sato", "Alvarez", "Greene", "Chen", "Dubois"]
CITY_POOL = ["Durham, NC", "Raleigh, NC", "Rocky Mount, NC", "Chapel Hill, NC", "Charlotte, NC", "Greensboro, NC", "Richmond, VA"]
STATUS_POOL = ["New", "New", "Pre-screening", "Contacted", "Screening visit scheduled", "Enrolled", "Enrolled", "Screen fail"]
NOTE_BANK = [
    "Left voicemail, patient called back same day. Prefers evening calls after 6pm.",
    "Phone pre-screen done. Confirms diagnosis from PCP, no surgery in past year.",
    "Patient asked about placebo odds and rescue medication. Explained both; still interested.",
    "Needs ride assistance. Submitted rideshare voucher request.",
]


async def _user(email: str, name: str, role: str) -> dict:
    db = get_db()
    u = await db.users.find_one({"email": email})
    if u:
        return u
    doc = {"email": email, "passwordHash": hash_password(DEMO_PASSWORD), "role": role, "legalName": name, "createdAt": now()}
    doc["_id"] = (await db.users.insert_one(doc)).inserted_id
    return doc


async def _diary(user_id, rng, days: int, baseline: float, gap_days: int = 0):
    end = date.today() - timedelta(days=gap_days)
    entries = forecast.simulate_patient(rng, days=days, start=end - timedelta(days=days), baseline=baseline)
    if entries:
        await get_db().diary.insert_many([{**e, "userId": user_id, "updatedAt": now(), "synthetic": True} for e in entries])


async def seed_if_empty() -> None:
    db = get_db()
    if await db.trials.count_documents({}) > 0:
        return
    print("[seed] seeding demo data")
    coord = await _user("coordinator@painbridge.demo", "Jordan Reyes", "coordinator")
    trial_docs = []
    for i, t in enumerate(TRIALS, start=1):
        doc = {**t, "protocolId": f"PB-DEMO-{i:03d}", "status": "Recruiting", "coordinatorId": coord["_id"], "createdAt": now()}
        doc["_id"] = (await db.trials.insert_one(doc)).inserted_id
        trial_docs.append(doc)

    rng = np.random.default_rng(7)

    patient = await _user("patient@painbridge.demo", "Alex Morgan", "patient")
    await db.profiles.insert_one({**DEMO_PROFILE, "userId": patient["_id"], "updatedAt": now()})
    await _diary(patient["_id"], rng, days=60, baseline=6.0, gap_days=1)

    # A synthetic referral pipeline for the coordinator dashboard.
    for i in range(12):
        name = f"{FIRST[i]} {LAST[(i * 5) % len(LAST)]}"
        u = await _user(f"patient{i + 1}@painbridge.demo", name, "patient")
        trial = trial_docs[i % len(trial_docs)]
        conds = list(trial["criteria"]["conditions"][:1])
        profile = {
            **DEMO_PROFILE,
            "age": int(rng.integers(max(trial["criteria"]["minAge"], 24), min(trial["criteria"]["maxAge"], 78))),
            "sex": ["Female", "Male"][int(rng.random() < 0.4)],
            "city": CITY_POOL[i % len(CITY_POOL)],
            "travelMiles": int(rng.choice([10, 25, 50, 100])),
            "painConditions": conds, "primaryCondition": conds[0],
            "painDurationMonths": int(rng.integers(8, 120)),
            "avgPain": int(rng.integers(4, 9)), "worstPain": 9,
            "phq2": int(rng.integers(0, 5)),
            "dailyOpioidMME": int(rng.choice([0, 0, 0, 15, 45])),
            "currentTreatments": ["NSAIDs", "Physical therapy"],
            "comorbidities": [str(rng.choice(["Diabetes", "Depression", "Sleep apnea"]))] if rng.random() < 0.5 else [],
            "interventionPrefs": [trial["interventionType"]],
            "placeboOk": str(rng.choice(["Yes", "Unsure"])),
            "barriers": list(rng.choice(["Transportation", "Work schedule", "Caregiving", "Cost of travel", "Language"],
                                        size=int(rng.integers(0, 3)), replace=False)),
        }
        await db.profiles.insert_one({**profile, "userId": u["_id"], "updatedAt": now()})
        status = STATUS_POOL[i % len(STATUS_POOL)]
        if status == "Enrolled":
            await _diary(u["_id"], rng, days=40, baseline=profile["avgPain"], gap_days=int(rng.choice([0, 1, 6])))
        elig = evaluate_eligibility(profile, trial)
        created = now() - timedelta(days=int(rng.integers(1, 30)))
        path = STATUS_POOL[: STATUS_POOL.index(status) + 1] if status not in ("New", "Screen fail") else ["New", status]
        steps = list(dict.fromkeys(path))
        # Spread events between referral time and now so nothing is dated in the future.
        span = (now() - created) / max(len(steps), 1)
        timeline = [{"status": s, "at": (created + span * k).isoformat(), "by": "patient" if k == 0 else coord["email"]}
                    for k, s in enumerate(steps)]
        notes = [{"text": n, "authorEmail": coord["email"], "createdAt": (created + span * (k + 0.5)).isoformat()}
                 for k, n in enumerate(NOTE_BANK[: min(len(timeline) - 1, len(NOTE_BANK))])]
        await db.referrals.insert_one({
            "patientId": u["_id"], "trialId": str(trial["_id"]), "coordinatorId": coord["_id"],
            "status": status, "shareDiary": True, "eligibility": elig,
            "match": _heuristic_match(profile, trial, elig), "notes": notes, "timeline": timeline,
            "screeningVisitAt": (date.today() + timedelta(days=3)).isoformat() + "T10:00" if status == "Screening visit scheduled" else None,
            "createdAt": created,
        })
    print("[seed] done")
