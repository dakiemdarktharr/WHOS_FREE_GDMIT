export function jsonError(message: string, status = 400) {
  return Response.json({ error: { message } }, { status });
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = message.includes("not configured") ? 503 : 500;
  return jsonError(status === 503 ? "The server is not configured for this feature yet." : message, status);
}
