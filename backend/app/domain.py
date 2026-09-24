"""Shared vocabularies and the rule-based eligibility engine.

Eligibility is decided here, deterministically, from structured criteria — never by
the LLM. The AI layer only scores fit/feasibility on top of this and explains it.
"""

from __future__ import annotations
import math

CONDITIONS = [
    "Chronic low back pain",
    "Fibromyalgia",
    "Knee osteoarthritis",
    "Diabetic peripheral neuropathy",
    "Post-herpetic neuralgia",
    "Chronic migraine",
    "CRPS",
    "Chronic neck pain",
    "Chronic post-surgical pain",
]

TREATMENTS = [
    "NSAIDs",
    "Acetaminophen",
    "Gabapentinoids",
    "SNRIs/TCAs",
    "Opioids",
    "Physical therapy",
    "CBT / pain psychology",
    "Injections / nerve blocks",
    "Acupuncture",
    "Topicals",
    "Spinal cord stimulator",
]

COMORBIDITIES = [
    "Diabetes",
    "Cardiovascular disease",
    "Kidney disease",
    "Liver disease",
    "Pregnant or planning pregnancy",
    "Active cancer",
    "Current substance use disorder",
    "Depression",
    "Anxiety",
    "Sleep apnea",
]

INTERVENTION_TYPES = [
    "Medication",
    "Device / neuromodulation",
    "Behavioral / digital",
    "Physical / exercise",
    "Procedure / injection",
]

BARRIERS = [
    "Transportation",
    "Work schedule",
    "Caregiving",
    "Cost of travel",
    "Language",
    "Technology access",
]

TRIGGERS = [
    "Poor sleep",
    "Stress",
    "Overexertion",
    "Weather change",
    "Long sitting",
    "Missed medication",
    "Menstrual cycle",
]

CITIES: dict[str, tuple[float, float]] = {
    "Durham, NC": (35.9940, -78.8986),
    "Raleigh, NC": (35.7796, -78.6382),
    "Chapel Hill, NC": (35.9132, -79.0558),
    "Rocky Mount, NC": (35.9382, -77.7905),
    "Greensboro, NC": (36.0726, -79.7920),
    "Charlotte, NC": (35.2271, -80.8431),
    "Richmond, VA": (37.5407, -77.4360),
    "Baltimore, MD": (39.2904, -76.6122),
    "Pittsburgh, PA": (40.4406, -79.9959),
    "New York, NY": (40.7128, -74.0060),
    "Boston, MA": (42.3601, -71.0589),
    "Atlanta, GA": (33.7490, -84.3880),
    "Seattle, WA": (47.6062, -122.3321),
    "San Francisco, CA": (37.7749, -122.4194),
}

REFERRAL_STATUSES = [
    "New",
    "Pre-screening",
    "Contacted",
    "Screening visit scheduled",
    "Enrolled",
    "Screen fail",
    "Withdrawn",
]


def miles_between(a: str | None, b: str | None) -> float | None:
    if a not in CITIES or b not in CITIES:
        return None
    (lat1, lon1), (lat2, lon2) = CITIES[a], CITIES[b]
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(3958.8 * 2 * math.asin(math.sqrt(h)), 1)


def nearest_site(profile: dict, trial: dict) -> tuple[dict | None, float | None]:
    best, best_d = None, None
    for site in trial.get("sites") or []:
        d = miles_between(profile.get("city"), site.get("city"))
        if d is not None and (best_d is None or d < best_d):
            best, best_d = site, d
    return best, best_d


def evaluate_eligibility(profile: dict, trial: dict) -> dict:
    """Check a patient profile against a trial's structured criteria.

    Returns:
      status: "likely" (all structured criteria met and a site is reachable),
              "possible" (criteria met but travel is a barrier to solve),
              "unlikely" (one or more structured criteria not met)
      met / unmet: human-readable criteria lines
      toConfirm: free-text criteria only the study team can verify at screening
    """
    c = trial.get("criteria") or {}
    met: list[str] = []
    unmet: list[str] = []

    age = profile.get("age")
    lo, hi = c.get("minAge", 18), c.get("maxAge", 85)
    if isinstance(age, int):
        (met if lo <= age <= hi else unmet).append(f"Age {lo}-{hi}")

    conds = c.get("conditions") or []
    if conds:
        mine = set(profile.get("painConditions") or [])
        hit = mine.intersection(conds)
        (met if hit else unmet).append("Diagnosis: " + " or ".join(conds))

    if c.get("minAvgPain") is not None:
        ok = (profile.get("avgPain") or 0) >= c["minAvgPain"]
        (met if ok else unmet).append(f"Average pain ≥ {c['minAvgPain']}/10")

    if c.get("minDurationMonths"):
        ok = (profile.get("painDurationMonths") or 0) >= c["minDurationMonths"]
        (met if ok else unmet).append(f"Pain for ≥ {c['minDurationMonths']} months")

    if c.get("maxOpioidMME") is not None:
        mme = profile.get("dailyOpioidMME") or 0
        (met if mme <= c["maxOpioidMME"] else unmet).append(f"Opioid use ≤ {c['maxOpioidMME']} MME/day")

    my_comorb = set(profile.get("comorbidities") or [])
    for ex in c.get("excludeComorbidities") or []:
        phrase = "Not pregnant or planning pregnancy" if ex.startswith("Pregnant") else f"No {ex.lower()}"
        (unmet if ex in my_comorb else met).append(phrase)

    my_tx = set(profile.get("currentTreatments") or [])
    for ex in c.get("excludeTreatments") or []:
        (unmet if ex in my_tx else met).append(f"Not currently using {ex}")

    if c.get("requiresPlacebo") and profile.get("placeboOk") == "No":
        unmet.append("Willing to be randomized to placebo")

    site, dist = nearest_site(profile, trial)
    # Hybrid trials (some remote visits) still need a reachable site; only fully remote ones don't.
    travel_limit = profile.get("travelMiles") or 25
    reachable = bool(trial.get("fullyRemote")) or (dist is not None and dist <= travel_limit)

    if unmet:
        status = "unlikely"
    elif reachable:
        status = "likely"
    else:
        status = "possible"

    return {
        "status": status,
        "met": met,
        "unmet": unmet,
        "toConfirm": list(c.get("otherCriteria") or []),
        "nearestSite": site.get("name") if site else None,
        "nearestSiteCity": site.get("city") if site else None,
        "distanceMiles": dist,
        "reachable": reachable,
    }
