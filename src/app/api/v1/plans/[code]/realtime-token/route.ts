import Ably from "ably";
import { z } from "zod";
import { apiError, jsonError } from "@/lib/http";
import { normalizePlanCode } from "@/lib/plan-code";
import { readPlan } from "@/lib/repository";

const tokenSchema = z.object({ participantId: z.string().trim().min(8).max(80) });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const code = normalizePlanCode((await context.params).code);
    if (!await readPlan(code)) return jsonError("Plan not found.", 404);
    const input = tokenSchema.safeParse(await request.json());
    if (!input.success) return jsonError("participantId is required.");
    if (!process.env.ABLY_API_KEY) return jsonError("Realtime is not configured yet.", 503);
    const rest = new Ably.Rest(process.env.ABLY_API_KEY);
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId: input.data.participantId,
      capability: JSON.stringify({ [`plan:${code}`]: ["publish", "subscribe", "presence"] }),
    });
    return Response.json(tokenRequest);
  } catch (error) {
    return apiError(error);
  }
}
