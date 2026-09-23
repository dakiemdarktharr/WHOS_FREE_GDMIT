import { z } from "zod";
import { apiError, jsonError } from "@/lib/http";
import { createPlan, ensureIndexes, upsertMember } from "@/lib/repository";
import { isIanaTimezone } from "@/lib/time";

const createSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  timezone: z.string().refine(isIanaTimezone, "timezone must be a valid IANA timezone"),
  participantId: z.string().trim().min(8).max(80),
});

export async function POST(request: Request) {
  try {
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return jsonError("displayName, timezone, and participantId are required.");
    await ensureIndexes();
    const code = await createPlan(input.data.participantId);
    await upsertMember(code, {
      participantId: input.data.participantId,
      displayName: input.data.displayName,
      timezone: input.data.timezone,
      joinedAt: new Date().toISOString(),
      submitted: false,
      confirmed: false,
    });
    return Response.json({ code, plan: await import("@/lib/repository").then(({ readPlan }) => readPlan(code)) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
