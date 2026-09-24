from typing import Literal
from pydantic import BaseModel, EmailStr, Field

Role = Literal["patient", "coordinator"]


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: Role
    legalName: str = Field(min_length=1, max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PatientProfileIn(BaseModel):
    age: int = Field(ge=18, le=100)
    sex: Literal["Female", "Male", "Intersex", "Prefer not to say"]
    city: str
    travelMiles: int = Field(ge=0, le=500)
    painConditions: list[str] = Field(min_length=1)
    primaryCondition: str
    painDurationMonths: int = Field(ge=0, le=600)
    avgPain: int = Field(ge=0, le=10)
    worstPain: int = Field(ge=0, le=10)
    interference: int = Field(ge=0, le=10)
    sleepQuality: int = Field(ge=0, le=10)
    phq2: int = Field(ge=0, le=6)
    gad2: int = Field(ge=0, le=6)
    currentTreatments: list[str] = []
    dailyOpioidMME: int = Field(default=0, ge=0, le=1000)
    comorbidities: list[str] = []
    interventionPrefs: list[str] = []
    placeboOk: Literal["Yes", "Unsure", "No"]
    visitAvailability: list[str] = []
    barriers: list[str] = []
    preferredLanguage: str = "English"


class SwipeIn(BaseModel):
    trialId: str
    decision: Literal["interested", "pass"]


class ReferralIn(BaseModel):
    trialId: str
    consentToShare: bool
    shareDiary: bool = True


class DiaryEntryIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    pain: int = Field(ge=0, le=10)
    sleepHours: float = Field(ge=0, le=16)
    sleepQuality: int = Field(ge=0, le=10)
    mood: int = Field(ge=0, le=10)
    stress: int = Field(ge=0, le=10)
    activityMinutes: int = Field(ge=0, le=600)
    rescueMeds: bool = False
    triggers: list[str] = []
    notes: str = Field(default="", max_length=1000)


class SiteIn(BaseModel):
    name: str
    city: str


class CriteriaIn(BaseModel):
    minAge: int = 18
    maxAge: int = 85
    conditions: list[str] = []
    minAvgPain: int | None = None
    minDurationMonths: int | None = None
    maxOpioidMME: int | None = None
    excludeComorbidities: list[str] = []
    excludeTreatments: list[str] = []
    requiresPlacebo: bool = False
    otherCriteria: list[str] = []


class TrialIn(BaseModel):
    title: str
    shortTitle: str
    sponsor: str
    phase: str
    interventionType: str
    intervention: str
    summary: str = ""
    whatToExpect: list[str] = []
    placebo: bool = False
    durationWeeks: int = Field(ge=1, le=520)
    visits: int = Field(ge=0, le=200)
    remoteVisits: bool = False
    fullyRemote: bool = False
    travelSupport: bool = False
    compensation: str = ""
    sites: list[SiteIn] = Field(min_length=1)
    targetEnrollment: int = Field(ge=1, default=60)
    status: Literal["Recruiting", "Paused", "Closed"] = "Recruiting"
    criteria: CriteriaIn


class TrialPatch(BaseModel):
    status: Literal["Recruiting", "Paused", "Closed"] | None = None
    summary: str | None = None
    whatToExpect: list[str] | None = None
    targetEnrollment: int | None = None


class LaySummaryIn(BaseModel):
    protocolNotes: str = ""
    trial: dict = {}


class ReferralPatch(BaseModel):
    status: str | None = None
    screeningVisitAt: str | None = None


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class ChatIn(BaseModel):
    messages: list[dict]
    trialId: str | None = None
