import type { NextFunction, Request, Response } from "express";

/**
 * Operational error with a stable machine-readable code, shaped per the
 * `/docs/API_ROUTES.md` error convention:
 * `{ "error": { "code", "message", "fields"? } }`.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 404 for routes outside the documented API surface. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}.` },
  });
}

/** Centralized error handler: maps known errors, hides internals otherwise. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
    return;
  }

  // Malformed JSON bodies surface as SyntaxError (body-parser) or an
  // entity.parse.failed HttpError in Express 5.
  if (
    error instanceof SyntaxError ||
    (typeof error === "object" &&
      error !== null &&
      "type" in error &&
      (error as { type?: unknown }).type === "entity.parse.failed")
  ) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." },
    });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error." },
  });
}
