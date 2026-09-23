import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";
import { AppError } from "./error.js";

/** Wrap an async route handler so rejections reach the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/**
 * Body validator: replaces `req.body` with the parsed output and forwards a
 * 400 VALIDATION_ERROR with per-field messages when parsing fails.
 */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        fields[key] = issue.message;
      }
      next(new AppError(400, "VALIDATION_ERROR", "Request validation failed.", fields));
      return;
    }
    req.body = parsed.data;
    next();
  };
}
