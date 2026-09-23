import type { AvailabilityUpdate, Member, PlanRoom } from "@/domain/types";
import { createPlanCode } from "@/lib/plan-code";
import { getDatabase } from "@/lib/mongodb";
import { calculateRecommendations } from "@/lib/planning";

type PlanDocument = { code: string; createdAt: string; createdBy: string; status: "collecting" | "confirmed" | "ready" };
type MemberDocument = Member & { planCode: string };
type AvailabilityDocument = AvailabilityUpdate & { planCode: string; timezone: string; updatedAt: string };

async function collections() {
  const db = await getDatabase();
  return {
    plans: db.collection<PlanDocument>("plans"),
    members: db.collection<MemberDocument>("members"),
    availability: db.collection<AvailabilityDocument>("availability"),
  };
}

export async function createPlan(createdBy: string) {
  const { plans } = await collections();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createPlanCode();
    try {
      await plans.insertOne({ code, createdAt: new Date().toISOString(), createdBy, status: "collecting" });
      return code;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) continue;
      throw error;
    }
  }
  throw new Error("Could not create a unique plan code");
}

export async function ensureIndexes() {
  const { plans, members, availability } = await collections();
  await Promise.all([
    plans.createIndex({ code: 1 }, { unique: true }),
    members.createIndex({ planCode: 1, participantId: 1 }, { unique: true }),
    availability.createIndex({ planCode: 1, participantId: 1, date: 1 }, { unique: true }),
  ]);
}

export async function readPlan(code: string): Promise<PlanRoom | null> {
  const { plans, members, availability } = await collections();
  const plan = await plans.findOne({ code });
  if (!plan) return null;
  const memberDocs = await members.find({ planCode: code }).sort({ joinedAt: 1 }).toArray();
  const availabilityDocs = await availability.find({ planCode: code }).toArray();
  const aggregated = new Map<string, AvailabilityUpdate>();
  for (const doc of availabilityDocs) {
    const current = aggregated.get(doc.participantId);
    if (!current) {
      aggregated.set(doc.participantId, {
        participantId: doc.participantId,
        date: doc.date,
        busyHours: doc.busyHours,
        busyUtc: doc.busyUtc,
        windowStart: doc.windowStart,
        windowEnd: doc.windowEnd,
      });
      continue;
    }
    current.busyHours = [...new Set([...current.busyHours, ...doc.busyHours])].sort((a, b) => a - b);
    current.busyUtc = [...new Set([...current.busyUtc, ...doc.busyUtc])].sort();
    current.windowStart = current.windowStart < doc.windowStart ? current.windowStart : doc.windowStart;
    current.windowEnd = current.windowEnd > doc.windowEnd ? current.windowEnd : doc.windowEnd;
  }
  return {
    code: plan.code,
    status: plan.status,
    createdAt: plan.createdAt,
    createdBy: plan.createdBy,
    members: memberDocs.map(({ planCode: _planCode, ...member }) => member),
    recommendations: calculateRecommendations(memberDocs, [...aggregated.values()]),
  };
}

export async function upsertMember(code: string, member: Member) {
  const { members } = await collections();
  await members.updateOne({ planCode: code, participantId: member.participantId }, { $set: { ...member, planCode: code } }, { upsert: true });
  return readPlan(code);
}

export async function upsertAvailability(code: string, update: AvailabilityUpdate & { timezone: string }) {
  const { availability, members } = await collections();
  await availability.updateOne(
    { planCode: code, participantId: update.participantId, date: update.date },
    { $set: { ...update, planCode: code, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
  await members.updateOne(
    { planCode: code, participantId: update.participantId },
    { $set: { submitted: true, windowStart: update.windowStart, windowEnd: update.windowEnd } },
  );
  return readPlan(code);
}

export async function confirmMember(code: string, participantId: string) {
  const { members, plans } = await collections();
  await members.updateOne({ planCode: code, participantId }, { $set: { confirmed: true } });
  const memberCount = await members.countDocuments({ planCode: code });
  const confirmedCount = await members.countDocuments({ planCode: code, confirmed: true });
  if (memberCount > 0 && memberCount === confirmedCount) await plans.updateOne({ code }, { $set: { status: "ready" } });
  return readPlan(code);
}

export async function readAvailability(code: string, participantId: string) {
  const { availability } = await collections();
  return availability.find({ planCode: code, participantId }).sort({ date: 1 }).toArray();
}
