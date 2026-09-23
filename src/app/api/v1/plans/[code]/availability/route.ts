import { z } from "zod";
import { apiError, jsonError } from "@/lib/http";
import { normalizePlanCode } from "@/lib/plan-code";
import { readAvailability, readPlan, upsertAvailability } from "@/lib/repository";
import { localDayBoundaryUtc, localHourToUtc, isIanaTimezone } from "@/lib/time";
import { publishPlanEvent } from "@/lib/realtime";

const availabilitySchema = z.object({
  participantId: z.string().trim().min(8).max(80),
  timezone: z.string().refine(isIanaTimezone, "timezone must be a valid IANA timezone"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  busyHours: z.array(z.number().int().min(0).max(23)).max(24),
  windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizePlanCode((await context.params).code);
    const participantId = new URL(request.url).searchParams.get("participantId");
    if (!participantId) return jsonError("participantId is required.");
    if (!await readPlan(code)) return jsonError("Plan not found.", 404);
    const records = await readAvailability(code, participantId);
    return Response.json({ availability: records.map(({ planCode: _planCode, updatedAt: _updatedAt, timezone: _timezone, ...record }) => record) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizePlanCode((await context.params).code);
    const plan = await readPlan(code);
    if (!plan) return jsonError("Plan not found.", 404);
    const input = availabilitySchema.safeParse(await request.json());
    if (!input.success) return jsonError("Availability payload is invalid.");
    const update = {
      participantId: input.data.participantId,
      date: input.data.date,
      busyHours: [...new Set(input.data.busyHours)].sort((a, b) => a - b),
      busyUtc: input.data.busyHours.map((hour) => localHourToUtc(input.data.date, hour, input.data.timezone)),
      windowStart: localDayBoundaryUtc(input.data.windowStart, input.data.timezone),
      windowEnd: localDayBoundaryUtc(input.data.windowEnd, input.data.timezone, true),
      timezone: input.data.timezone,
    };
    const updated = await upsertAvailability(code, update);
    await publishPlanEvent(code, "availability.updated", { participantId: update.participantId, date: update.date });
    return Response.json({ update, plan: updated });
  } catch (error) {
    return apiError(error);
  }
}
