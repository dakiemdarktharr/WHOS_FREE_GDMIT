export type PlanStatus = "collecting" | "confirmed" | "ready";

export type Member = {
  participantId: string;
  displayName: string;
  timezone: string;
  joinedAt: string;
  submitted: boolean;
  confirmed: boolean;
  windowStart?: string;
  windowEnd?: string;
};

export type PlanRoom = {
  code: string;
  status: PlanStatus;
  createdAt: string;
  createdBy: string;
  members: Member[];
  recommendations: Recommendation[];
};

export type AvailabilityUpdate = {
  participantId: string;
  date: string;
  busyHours: number[];
  busyUtc: string[];
  windowStart: string;
  windowEnd: string;
};

export type Recommendation = {
  startsAtUtc: string;
  busyCount: number;
  availableCount: number;
};
