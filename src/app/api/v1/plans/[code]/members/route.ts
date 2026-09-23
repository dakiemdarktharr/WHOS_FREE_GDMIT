import { z } from "zod";
import { apiError, jsonError } from "@/lib/http";
import { normalizePlanCode } from "@/lib/plan-code";
import { readPlan, upsertMember } from "@/lib/repository";
import { isIanaTimezone } from "@/lib/time";

const joinSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  timezone: z.string().refine(isIanaTimezone, "timezone must be a valid IANA timezone"),
  participantId: z.string().trim().min(8).max(80),
});

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizePlanCode((await context.params).code);
    const plan = await readPlan(code);
    if (!plan) return jsonError("Plan not found.", 404);
    const input = joinSchema.safeParse(await request.json());
    if (!input.success) return jsonError("displayName, timezone, and participantId are required.");
    const updated = await upsertMember(code, {
      ...input.data,
      joinedAt: new Date().toISOString(),
      submitted: false,
      confirmed: false,
    });
    return Response.json({ plan: updated });
  } catch (error) {
    return apiError(error);
  }
}
