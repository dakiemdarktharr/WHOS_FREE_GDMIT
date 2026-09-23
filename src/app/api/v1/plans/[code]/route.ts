import { apiError, jsonError } from "@/lib/http";
import { confirmMember, readPlan } from "@/lib/repository";
import { z } from "zod";

const confirmSchema = z.object({ participantId: z.string().trim().min(8).max(80), status: z.literal("confirmed") });
import { normalizePlanCode } from "@/lib/plan-code";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizePlanCode((await context.params).code);
    if (code.length !== 5) return jsonError("Plan code must contain five characters.");
    const plan = await readPlan(code);
    if (!plan) return jsonError("Plan not found.", 404);
    return Response.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizePlanCode((await context.params).code);
    const input = confirmSchema.safeParse(await request.json());
    if (!input.success) return jsonError("participantId and status=confirmed are required.");
    const plan = await readPlan(code);
    if (!plan) return jsonError("Plan not found.", 404);
    const member = plan.members.find((item) => item.participantId === input.data.participantId);
    if (!member?.submitted) return jsonError("Save at least one day before confirming.");
    return Response.json({ plan: await confirmMember(code, input.data.participantId) });
  } catch (error) {
    return apiError(error);
  }
}
