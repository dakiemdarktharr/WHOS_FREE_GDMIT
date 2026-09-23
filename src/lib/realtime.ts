import Ably from "ably";

export async function publishPlanEvent(code: string, name: string, data: unknown) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return;
  const rest = new Ably.Rest(key);
  await rest.channels.get(`plan:${code}`).publish(name, data);
}
