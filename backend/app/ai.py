"""Duke AI Gateway (LiteLLM) helpers.

Uses the OpenAI SDK pointed at Duke's LiteLLM proxy. The SDK is sync — wrap calls in
`run_in_threadpool` from async route handlers. Every function has a deterministic
fallback so the app stays usable when the key is missing or the call fails.

Only de-identified, structured fields are sent to the model (no names, emails, or
free-text identifiers).
"""

from __future__ import annotations
import json
import re
import time
from typing import Any
from openai import OpenAI
from .config import settings

_client: OpenAI | None = None


def _get_client() -> OpenAI | None:
    global _client
    if _client is not None:
        return _client
    if not settings.LITELLM_TOKEN:
        return None
    _client = OpenAI(api_key=settings.LITELLM_TOKEN, base_url="https://litellm.oit.duke.edu/v1",
                     timeout=25, max_retries=0)
    return _client


_BREAKER_SECONDS = 300
_down_until = 0.0
_verified = False


def _reachable(client: OpenAI) -> bool:
    """Cheap probe before the first real call (and after the breaker expires), so an
    unreachable gateway costs one ~6s check instead of a full completion timeout."""
    global _down_until, _verified
    if time.monotonic() < _down_until:
        return False
    if _verified:
        return True
    try:
        client.with_options(timeout=6).models.list()
        _verified = True
        return True
    except Exception as e:
        _down_until = time.monotonic() + _BREAKER_SECONDS
        print(f"[ai] gateway unreachable ({e}); using fallbacks for {_BREAKER_SECONDS}s")
        return False


def _complete(system: str, messages: list[dict], temperature: float) -> str | None:
    """Return the model's reply, or None so the caller uses its deterministic fallback.

    After a failure the gateway is skipped for a few minutes (circuit breaker) so an
    unreachable gateway doesn't make every screen wait for a timeout.
    """
    global _down_until, _verified
    client = _get_client()
    if client is None or not _reachable(client):
        return None
    payload: list[dict] = [{"role": "system", "content": system}]
    for m in messages:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str) and m["content"].strip():
            payload.append({"role": m["role"], "content": m["content"]})
    try:
        resp = client.chat.completions.create(
            model=settings.LITELLM_MODEL or "Mistral on-site",
            messages=payload,
            temperature=temperature,
        )
        return (resp.choices[0].message.content or "").strip() or None
    except Exception as e:
        _down_until = time.monotonic() + _BREAKER_SECONDS
        _verified = False
        print(f"[ai] gateway call failed ({e}); using fallbacks for {_BREAKER_SECONDS}s")
        return None


def warm_up() -> None:
    client = _get_client()
    if client is not None:
        _reachable(client)


def _json_extract(text: str | None) -> Any:
    """Best-effort JSON parse: strips fences, finds the first {...} block."""
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    for candidate in ([fenced.group(1)] if fenced else []) + [
        m.group(0) for m in [re.search(r"\{[\s\S]*\}", text)] if m
    ] + [text.strip()]:
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return None


# ---------------------------------------------------------------- safety

_CRISIS_PATTERNS = re.compile(
    r"\b(kill myself|suicid\w*|end my life|want to die|don'?t want to (live|be here)|self[- ]harm|hurt myself|overdose on purpose)\b",
    re.I,
)

CRISIS_REPLY = (
    "I'm really glad you told me. Living with chronic pain is exhausting, and what you're feeling "
    "deserves real support right now, more than an app can give.\n\n"
    "* **Call or text 988** (Suicide & Crisis Lifeline, US) to talk with someone 24/7.\n"
    "* If you might act on these thoughts or are in danger, **call 911** or go to the nearest emergency room.\n"
    "* If you're in a study, you can also call your study team. They want to know, and it won't get you "
    "in trouble.\n\n"
    "You don't have to go through this alone."
)


def crisis_check(text: str) -> bool:
    return bool(_CRISIS_PATTERNS.search(text or ""))


# ---------------------------------------------------------------- chat assistants

TRIAL_GUIDE_PROMPT = """You are PainBridge's Clinical Trial Guide. You help people living with chronic pain understand clinical research so they can make an informed, unpressured decision about joining a study.

You explain clearly:
- Trial phases (1-4), device and behavioral studies, observational studies.
- Randomization, placebo/sham controls, blinding, and why they exist. Placebo arms still receive standard care in most pain trials. The patient should ask the site about rescue medication rules.
- Informed consent: it's a process, not a signature. Participants can ask anything and can withdraw at any time without losing their usual care.
- Screening visits, washout periods (stopping a medication before a study; ONLY under the study doctor's supervision), daily pain diaries (ePROs), visit schedules, compensation and travel reimbursement.
- Protections: IRB oversight, the right to a copy of the consent form, ClinicalTrials.gov registration, reporting side effects.
- Questions worth asking the study team.

Style: warm, plain language (about 8th-grade reading level), 2-4 short paragraphs or a tight bulleted list. Never pressure anyone to enroll. Never tell someone to stop, start, or change a medication; say to discuss it with their doctor and the study team. You are not a doctor. If asked about a specific study's details you don't have, tell them to ask the site coordinator.
"""

PAIN_COACH_PROMPT = """You are PainBridge's Pain Self-Management Coach. You support adults living with chronic pain using evidence-based, non-pharmacological strategies: activity pacing and graded activity, sleep hygiene, stress reduction and relaxation (paced breathing, progressive muscle relaxation), cognitive-behavioral and acceptance-based skills, flare-up planning, gentle movement, and communicating with their care team.

Rules:
- Never recommend starting, stopping, or changing the dose of any medication. For medication questions, say to talk with their prescriber or pharmacist.
- Urge urgent care for red flags: new weakness or numbness, loss of bladder/bowel control, fever with back pain, chest pain, sudden severe headache, or pain after a significant injury.
- Personalize using the patient context and forecast provided (if any), but do not overstate the model: it shows statistical patterns, not certainties.
- Validate, don't dismiss. Chronic pain is real even when tests are normal.
- Keep replies short (2-4 short paragraphs or a bulleted list), concrete and doable today.
You are not a clinician and do not diagnose.
"""


def _context_block(title: str, ctx: dict | None) -> str:
    if not ctx:
        return ""
    clean = {k: v for k, v in ctx.items() if v not in (None, "", [], {})}
    return f"\n\n{title}:\n{json.dumps(clean, default=str)}" if clean else ""


def chat_trial_guide(messages: list[dict], trial_context: dict | None = None) -> str:
    last = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    if crisis_check(last):
        return CRISIS_REPLY
    fallback = (
        "I can't reach the trial guide right now, but here are the essentials:\n\n"
        "* **Joining is always voluntary**, and you can leave a study at any time without losing your usual care.\n"
        "* **Informed consent** means the team must explain risks, benefits, the visit schedule, and "
        "whether there's a placebo *before* you agree. Ask for a copy to take home.\n"
        "* **Never stop a pain medication on your own** to qualify. Any washout is done under the study doctor's supervision.\n\n"
        "Good questions for the coordinator: *How many visits? Can some be remote? Is travel reimbursed? "
        "What happens if my pain gets worse during the study?*"
    )
    reply = _complete(TRIAL_GUIDE_PROMPT + _context_block("The patient is asking about this study", trial_context), messages, 0.5)
    return reply or fallback


def chat_pain_coach(messages: list[dict], patient_context: dict | None = None) -> str:
    last = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    if crisis_check(last):
        return CRISIS_REPLY
    fallback = (
        "I can't reach the coach right now. Here's a quick flare-day plan you can use today:\n\n"
        "* **Pace, don't push.** Split tasks into short blocks with rests *before* pain spikes.\n"
        "* **Calm the nervous system.** Try 5 minutes of slow breathing (in 4, out 6).\n"
        "* **Gentle movement** such as a short walk or stretching usually beats full rest.\n"
        "* **Protect tonight's sleep:** consistent bedtime, screens off 30 minutes before.\n\n"
        "If you notice new weakness, numbness, loss of bladder/bowel control, or fever with back pain, seek urgent care."
    )
    reply = _complete(PAIN_COACH_PROMPT + _context_block("Patient context (de-identified)", patient_context), messages, 0.6)
    return reply or fallback


# ---------------------------------------------------------------- trial matching

MATCH_PROMPT = """You are a clinical research matching assistant. Rule-based eligibility has ALREADY been computed and is given to you; do not re-decide eligibility. Your job is to score how good a fit this study is FOR THE PATIENT (their preferences, feasibility with supports, relevance to their condition) and explain it.

Return STRICT JSON:
{
  "score": <integer 0-100>,
  "reasons": [<2-4 concrete fit factors, each under 90 characters>],
  "summary": "<1-2 warm, plain-language sentences>",
  "barriers": [<0-3 participation barriers, each paired with a concrete support, under 110 characters>]
}

Equity rules (critical):
- Do NOT use race, ethnicity, language, insurance, income, education, or neighborhood as reasons to lower the score.
- Participation barriers (transportation, work schedule, caregiving, travel cost, language, technology access) are NOT reasons to lower fit. List them in "barriers" paired with a support, e.g. "Work schedule: 6 of 10 visits can be done remotely".
- Eligibility "unlikely" should cap the score at 40. Say what criterion is the issue, kindly.

Scoring bands: 85-100 strong fit with the patient's preferences and condition; 65-84 good fit with something to discuss; 41-64 partial fit; 0-40 unlikely eligible or a clear preference mismatch.

Return ONLY the JSON object.
"""

_BARRIER_SUPPORT = {
    "Transportation": lambda t: "Transportation: study offers travel reimbursement / rides" if t.get("travelSupport")
    else "Transportation: ask the site about ride services or remote visits",
    "Work schedule": lambda t: "Work schedule: some visits can be done remotely" if t.get("remoteVisits")
    else "Work schedule: ask about early-morning or evening visit slots",
    "Caregiving": lambda t: "Caregiving: ask to cluster visits or bring a dependent",
    "Cost of travel": lambda t: "Travel cost: study reimburses travel" if t.get("travelSupport")
    else "Travel cost: ask whether parking and mileage are reimbursed",
    "Language": lambda t: "Language: request a qualified interpreter and a translated consent form",
    "Technology access": lambda t: "Tech access: ask if the study provides a device or data plan"
    if t.get("remoteVisits") else "Tech access: this study is mostly in-person",
}


def _heuristic_match(profile: dict, trial: dict, elig: dict) -> dict:
    score, reasons = 60, []
    status = elig.get("status")
    if status == "likely":
        score += 15
        reasons.append("You meet all of the pre-screen criteria we can check online.")
    elif status == "possible":
        score += 5
    prefs = profile.get("interventionPrefs") or []
    itype = trial.get("interventionType")
    if itype in prefs:
        score += 12
        reasons.append(f"Matches your interest in {itype.lower()} options.")
    elif prefs:
        score -= 6
    if profile.get("primaryCondition") in (trial.get("criteria") or {}).get("conditions", []):
        score += 6
        reasons.append(f"Studies your main condition: {profile.get('primaryCondition').lower()}.")
    if trial.get("placebo"):
        if profile.get("placeboOk") == "Yes":
            score += 3
        elif profile.get("placeboOk") == "Unsure":
            reasons.append("Has a placebo arm, so ask the team about your odds and rescue meds.")
    if trial.get("remoteVisits"):
        score += 4
        reasons.append("Several visits can be done from home.")

    barriers = [_BARRIER_SUPPORT[b](trial) for b in profile.get("barriers") or [] if b in _BARRIER_SUPPORT]
    if not elig.get("reachable") and elig.get("distanceMiles") is not None:
        barriers.insert(0, f"Distance: nearest site is {elig['distanceMiles']:.0f} mi, so ask about travel support")

    if status == "unlikely":
        score = min(score - 30, 40)
        issue = (elig.get("unmet") or ["a study criterion"])[0]
        reasons.insert(0, f"May not qualify: {issue}.")
    score = max(0, min(100, score))
    name = trial.get("shortTitle") or "This study"
    if score >= 85:
        summary = f"{name} lines up well with your condition and what you're looking for."
    elif score >= 65:
        summary = f"{name} is a good fit to explore. Review the notes below with the study team."
    elif status == "unlikely":
        summary = f"You may not qualify for {name} based on your answers, but the study team makes the final call."
    else:
        summary = f"{name} is a partial fit for your preferences."
    return {"score": score, "reasons": reasons[:4] or ["Worth a conversation with the study team."],
            "summary": summary, "barriers": barriers[:3], "source": "rules"}


def _profile_for_ai(profile: dict) -> dict:
    keys = ["age", "sex", "painConditions", "primaryCondition", "painDurationMonths", "avgPain",
            "worstPain", "interference", "sleepQuality", "currentTreatments", "dailyOpioidMME",
            "comorbidities", "interventionPrefs", "placeboOk", "visitAvailability", "barriers",
            "travelMiles"]
    return {k: profile.get(k) for k in keys}


def _trial_for_ai(trial: dict) -> dict:
    keys = ["shortTitle", "phase", "interventionType", "intervention", "placebo", "durationWeeks",
            "visits", "remoteVisits", "travelSupport", "compensation", "summary"]
    return {k: trial.get(k) for k in keys}


def score_trial_match(profile: dict, trial: dict, elig: dict) -> dict:
    fallback = _heuristic_match(profile, trial, elig)
    msg = (
        "Score this patient-study pair. Return strict JSON as instructed.\n\n"
        f"Patient (de-identified): {json.dumps(_profile_for_ai(profile))}\n\n"
        f"Study: {json.dumps(_trial_for_ai(trial))}\n\n"
        f"Rule-based eligibility: {json.dumps({k: elig.get(k) for k in ('status', 'met', 'unmet', 'distanceMiles', 'reachable')})}"
    )
    parsed = _json_extract(_complete(MATCH_PROMPT, [{"role": "user", "content": msg}], 0.3))
    if not isinstance(parsed, dict):
        return fallback
    try:
        score = max(0, min(100, int(parsed.get("score"))))
    except (TypeError, ValueError):
        return fallback
    if elig.get("status") == "unlikely":
        score = min(score, 40)
    reasons = [str(r).strip()[:90] for r in parsed.get("reasons") or [] if str(r).strip()][:4]
    barriers = [str(b).strip()[:110] for b in parsed.get("barriers") or [] if str(b).strip()][:3]
    summary = str(parsed.get("summary") or "").strip()[:300]
    return {
        "score": score,
        "reasons": reasons or fallback["reasons"],
        "summary": summary or fallback["summary"],
        "barriers": barriers or fallback["barriers"],
        "source": "ai",
    }


# ---------------------------------------------------------------- coordinator tools

PRESCREEN_PROMPT = """You are a clinical research coordinator's assistant preparing a pre-screen brief for a referred chronic pain patient.

Return STRICT JSON:
{
  "verify": [<up to 4 items the coordinator must confirm at screening, each under 90 characters>],
  "supports": [<up to 3 retention/participation supports to offer, each under 90 characters>],
  "summary": "<2 sentences, neutral and factual>"
}

Rules:
- Base items on the rule-based eligibility result, the free-text criteria to confirm, and the patient's answers.
- Do NOT flag race, ethnicity, language, insurance, income, or disability as risks. Frame barriers as supports to offer (interpreter, remote visits, travel reimbursement, flexible hours).
- Flag clinically relevant items neutrally (e.g., "Confirm stable opioid dose (reports 30 MME/day)", "Elevated mood screen: follow site's safety procedure").
Return ONLY the JSON object.
"""


def _heuristic_prescreen(profile: dict, trial: dict, elig: dict, diary: dict | None) -> dict:
    verify = list(elig.get("unmet") or [])[:2]
    verify += [f"Confirm: {c}" for c in (elig.get("toConfirm") or [])][: 4 - len(verify)]
    if (profile.get("phq2") or 0) >= 3:
        verify.insert(0, "Positive PHQ-2 mood screen: follow site safety procedure")
    if (profile.get("dailyOpioidMME") or 0) > 0:
        verify.append(f"Confirm stable opioid dose (reports {profile.get('dailyOpioidMME')} MME/day)")
    supports = [_BARRIER_SUPPORT[b](trial) for b in profile.get("barriers") or [] if b in _BARRIER_SUPPORT]
    if diary and diary.get("retentionRisk") in ("Medium", "High"):
        supports.append("Diary adherence is uneven, so set up reminder texts")
    summary = (
        f"Pre-screen status: {elig.get('status')}. {len(elig.get('met') or [])} criteria met, "
        f"{len(elig.get('unmet') or [])} not met, {len(elig.get('toConfirm') or [])} to confirm at screening."
    )
    return {"verify": verify[:4], "supports": supports[:3], "summary": summary, "source": "rules"}


def prescreen_brief(profile: dict, trial: dict, elig: dict, diary: dict | None) -> dict:
    fallback = _heuristic_prescreen(profile, trial, elig, diary)
    msg = (
        f"Patient answers (de-identified): {json.dumps({**_profile_for_ai(profile), 'phq2': profile.get('phq2'), 'gad2': profile.get('gad2')})}\n\n"
        f"Study: {json.dumps(_trial_for_ai(trial))}\n\n"
        f"Rule-based eligibility: {json.dumps(elig)}\n\n"
        f"Diary summary: {json.dumps(diary or {})}"
    )
    parsed = _json_extract(_complete(PRESCREEN_PROMPT, [{"role": "user", "content": msg}], 0.3))
    if not isinstance(parsed, dict):
        return fallback
    return {
        "verify": [str(x)[:90] for x in parsed.get("verify") or []][:4] or fallback["verify"],
        "supports": [str(x)[:90] for x in parsed.get("supports") or []][:3] or fallback["supports"],
        "summary": str(parsed.get("summary") or fallback["summary"])[:400],
        "source": "ai",
    }


NOTES_PROMPT = """You are a clinical research coordinator summarizing contact and screening notes about one referred patient for the study team.

Output markdown with EXACTLY these sections:

## Where things stand
2-3 sentences.

## Confirmed so far
Bulleted list.

## Open items
Bulleted list of what still needs to be verified or scheduled. If none, "No open items."

## Next step
One sentence starting with exactly one of: "Schedule screening —", "Follow up —", "Ready to consent —", "Likely screen fail —", "Insufficient information —".

Under 180 words. Do not invent facts; only synthesize the notes.
"""


def summarize_notes(notes: list[dict]) -> str:
    cleaned = [{"text": n.get("text"), "at": str(n.get("createdAt") or "")} for n in notes or [] if (n.get("text") or "").strip()]
    if not cleaned:
        return ("## Where things stand\nNo notes logged yet.\n\n## Confirmed so far\n- (none)\n\n"
                "## Open items\n- Initial contact\n\n## Next step\nInsufficient information — log a note after first contact.")
    fallback = (
        f"## Where things stand\n{len(cleaned)} note(s) logged. The AI summarizer is unavailable, so read the raw notes.\n\n"
        "## Confirmed so far\n- (see notes)\n\n## Open items\n- (see notes)\n\n"
        "## Next step\nInsufficient information — review notes manually."
    )
    msg = f"Notes (chronological):\n{json.dumps(cleaned, indent=2)}"
    return _complete(NOTES_PROMPT, [{"role": "user", "content": msg}], 0.3) or fallback


LAY_SUMMARY_PROMPT = """You write plain-language study descriptions for people living with chronic pain, at about a 7th-grade reading level. Given protocol notes from a study team, return STRICT JSON:
{
  "summary": "<2-3 sentences: what is being tested, who it's for, what participation involves>",
  "whatToExpect": [<3-5 short bullets about visits, diaries, duration, placebo, compensation>]
}
Be accurate and never overstate benefits ("may help", "is being tested", not "will relieve"). Mention placebo/sham plainly if present. Return ONLY JSON.
"""


def generate_lay_summary(protocol_notes: str, trial: dict) -> dict:
    facts = {k: trial.get(k) for k in ("shortTitle", "phase", "interventionType", "intervention",
                                        "placebo", "durationWeeks", "visits", "remoteVisits", "compensation")}
    fallback = {
        "summary": (f"This study is testing {trial.get('intervention') or 'a new approach'} for people with chronic pain. "
                    f"It lasts about {trial.get('durationWeeks') or '?'} weeks with {trial.get('visits') or 'several'} visits."),
        "whatToExpect": [
            f"About {trial.get('visits') or 'several'} study visits over {trial.get('durationWeeks') or '?'} weeks",
            "A short daily pain diary on your phone",
            "You may receive a placebo (inactive) version" if trial.get("placebo") else "Everyone receives the study intervention",
            f"Compensation: {trial.get('compensation') or 'ask the study team'}",
        ],
        "source": "rules",
    }
    msg = f"Known facts: {json.dumps(facts)}\n\nProtocol notes: {protocol_notes or '(none)'}"
    parsed = _json_extract(_complete(LAY_SUMMARY_PROMPT, [{"role": "user", "content": msg}], 0.5))
    if not isinstance(parsed, dict) or not str(parsed.get("summary") or "").strip():
        return fallback
    bullets = [str(b)[:140] for b in parsed.get("whatToExpect") or [] if str(b).strip()][:5]
    return {"summary": str(parsed["summary"]).strip()[:600], "whatToExpect": bullets or fallback["whatToExpect"], "source": "ai"}


PLAN_PROMPT = """You are a pain self-management coach writing a one-week plan for a person with chronic pain, based on their profile, their personal pain forecast, and the factors their own diary shows are linked to their pain.

Output markdown with EXACTLY these sections:

## This week's focus
1-2 sentences naming the single most useful focus, grounded in their top diary-linked factor.

## Pacing & movement
2-3 bullets.

## Sleep
2 bullets.

## Stress & mood
2 bullets.

## Flare plan
2-3 bullets for high-risk days in the forecast (name the days if flare risk is elevated).

## Talk with your care team about
1-3 bullets (e.g., medication questions, referral to PT or pain psychology). NEVER suggest specific medication changes.

## Seek care urgently if
One line listing red flags: new weakness/numbness, loss of bladder/bowel control, fever with back pain, chest pain, sudden severe headache.

Warm, concrete, under 300 words. Describe the forecast as a statistical estimate, not a certainty.
"""


def _fallback_plan(profile: dict, fc: dict) -> str:
    drivers = fc.get("drivers") or []
    top = drivers[0]["label"].lower() if drivers else "pacing"
    risky = [d for d in fc.get("forecast") or [] if d.get("flareProb", 0) >= 0.15]
    flare_line = (
        f"- Your forecast shows higher flare risk around {', '.join(d['date'] for d in risky[:3])}. Keep those days lighter."
        if risky else "- No high-risk days in this week's forecast. Still keep a flare kit ready (heat/ice, breathing, a plan to rest in short blocks)."
    )
    return f"""## This week's focus
Of everything you log, your diary links **{top}** most closely to next-day pain, so start there.

## Pacing & movement
- Set an activity "baseline" you can do even on a bad day, and increase by about 10% per week.
- Break long tasks into 20-30 minute blocks with short rests *before* pain spikes.
- Avoid boom-bust days: your data links overexertion to higher pain the next day.

## Sleep
- Keep a consistent wake time, even after a poor night.
- Wind down screen-free for 30 minutes before bed.

## Stress & mood
- Try 5 minutes of slow breathing (in 4, out 6) twice a day.
- Plan one enjoyable, low-effort activity daily.

## Flare plan
{flare_line}
- On flare days, keep gentle movement going rather than full bed rest.

## Talk with your care team about
- Whether physical therapy or pain psychology (CBT for pain) could help.
- Any questions about your medications. Don't change them on your own.

## Seek care urgently if
New weakness or numbness, loss of bladder/bowel control, fever with back pain, chest pain, or a sudden severe headache.
"""


def management_plan(profile: dict, fc: dict) -> str:
    fallback = _fallback_plan(profile, fc)
    ctx = {
        "profile": _profile_for_ai(profile),
        "forecast": {k: fc.get(k) for k in ("model", "baseline", "flareThreshold", "flareRisk7d", "forecast")},
        "topDiaryFactors": [{k: d[k] for k in ("label", "direction", "effect")} for d in (fc.get("drivers") or [])[:4]],
        "whatIfScenarios": fc.get("scenarios"),
    }
    return _complete(PLAN_PROMPT, [{"role": "user", "content": json.dumps(ctx, default=str)}], 0.5) or fallback
