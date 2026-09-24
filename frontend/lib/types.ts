export type Role = "patient" | "coordinator";

export type User = { id: string; email: string; role: Role; legalName: string };

export type Meta = {
  conditions: string[];
  treatments: string[];
  comorbidities: string[];
  interventionTypes: string[];
  barriers: string[];
  triggers: string[];
  cities: string[];
  referralStatuses: string[];
};

export type Profile = {
  age: number;
  sex: "Female" | "Male" | "Intersex" | "Prefer not to say";
  city: string;
  travelMiles: number;
  painConditions: string[];
  primaryCondition: string;
  painDurationMonths: number;
  avgPain: number;
  worstPain: number;
  interference: number;
  sleepQuality: number;
  phq2: number;
  gad2: number;
  currentTreatments: string[];
  dailyOpioidMME: number;
  comorbidities: string[];
  interventionPrefs: string[];
  placeboOk: "Yes" | "Unsure" | "No";
  visitAvailability: string[];
  barriers: string[];
  preferredLanguage: string;
};

export type Criteria = {
  minAge: number;
  maxAge: number;
  conditions: string[];
  minAvgPain?: number | null;
  minDurationMonths?: number | null;
  maxOpioidMME?: number | null;
  excludeComorbidities: string[];
  excludeTreatments: string[];
  requiresPlacebo: boolean;
  otherCriteria: string[];
};

export type Trial = {
  id: string;
  protocolId: string;
  title: string;
  shortTitle: string;
  sponsor: string;
  phase: string;
  interventionType: string;
  intervention: string;
  summary: string;
  whatToExpect: string[];
  placebo: boolean;
  durationWeeks: number;
  visits: number;
  remoteVisits: boolean;
  fullyRemote?: boolean;
  travelSupport: boolean;
  compensation: string;
  sites: { name: string; city: string }[];
  targetEnrollment: number;
  enrolled: number;
  status: "Recruiting" | "Paused" | "Closed";
  criteria: Criteria;
};

export type Eligibility = {
  status: "likely" | "possible" | "unlikely";
  met: string[];
  unmet: string[];
  toConfirm: string[];
  nearestSite: string | null;
  nearestSiteCity: string | null;
  distanceMiles: number | null;
  reachable: boolean;
};

export type Match = { score: number; reasons: string[]; summary: string; barriers: string[]; source: "ai" | "rules" };

export type DeckItem = { trial: Trial; eligibility: Eligibility; match: Match };

export type TimelineEvent = { status: string; at: string; by: string };

export type Referral = {
  id: string;
  trialId: string;
  status: string;
  createdAt: string;
  screeningVisitAt?: string | null;
  timeline: TimelineEvent[];
  eligibility: Eligibility;
  match: Match;
};

export type SavedItem = DeckItem & { referral: Referral | null };
export type MyReferral = Referral & { trial: Trial };

export type DiaryEntry = {
  date: string;
  pain: number;
  sleepHours: number;
  sleepQuality: number;
  mood: number;
  stress: number;
  activityMinutes: number;
  rescueMeds: boolean;
  triggers: string[];
  notes: string;
  synthetic?: boolean;
};

export type ForecastDay = { date: string; mean: number; low: number; high: number; flareProb: number };
export type Driver = { factor: string; label: string; effect: number; direction: "raises" | "lowers"; explanation: string };
export type Scenario = { label: string; predicted: number; delta: number };

export type Forecast =
  | { ready: false; entriesNeeded: number; history: { date: string; pain: number }[] }
  | {
      ready: true;
      model: "personalized" | "population";
      trainingDays: number;
      baseline: number;
      flareThreshold: number;
      history: { date: string; pain: number }[];
      forecast: ForecastDay[];
      flareRisk7d: number;
      scenarios: Scenario[];
      drivers: Driver[];
      residualSD: number;
    };

export type ModelCard = {
  trainedOn: string;
  testSet: string;
  target: string;
  maeModel: number;
  maePersistence: number;
  maeMean7: number;
  maePopulationLast30: number;
  maePersonalizedLast30: number;
  residualSD: number;
  limitations: string[];
};

export type DiarySummary = {
  entries: number;
  adherence14d: number;
  daysSinceLastEntry: number | null;
  avgPain14d: number | null;
  weeklyTrend: number;
  retentionRisk: "Low" | "Medium" | "High";
};

export type ReferralRow = {
  id: string;
  status: string;
  createdAt: string;
  screeningVisitAt?: string | null;
  patient: { initials: string; age?: number; sex?: string; city?: string; primaryCondition?: string; avgPain?: number };
  trial: { id: string; shortTitle: string; protocolId: string };
  eligibilityStatus: Eligibility["status"];
  matchScore: number;
  barriers: string[];
  diary: DiarySummary | null;
};

export type Prescreen = { verify: string[]; supports: string[]; summary: string; source: "ai" | "rules" };
export type Note = { text: string; authorEmail: string; createdAt: string };

export type ReferralDetail = ReferralRow & {
  contact: { name: string; email: string };
  profile: Profile;
  eligibility: Eligibility;
  match: Match;
  prescreen: Prescreen | null;
  notes: Note[];
  timeline: TimelineEvent[];
  diaryHistory: { date: string; pain: number }[];
};

export type Overview = {
  funnel: {
    trialId: string;
    shortTitle: string;
    protocolId: string;
    status: string;
    enrolled: number;
    target: number;
    referrals: number;
    counts: Record<string, number>;
  }[];
  representation: Record<"sex" | "age" | "travel", { referred: Record<string, number>; enrolled: Record<string, number> }>;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
