import { rateLimit } from "express-rate-limit";
import type { Response } from "express";

/**
 * Rate limiting for the guessable room-code surface.
 *
 * The five-digit room code is a deliberate product contract (short enough
 * to type), so its entropy is low by design. These per-IP limits raise the
 * cost of enumerating codes through the REST surface. The in-memory store
 * is per-process, which matches the single-instance deployment model.
 */

function rateLimitedResponse(res: Response): void {
  res.status(429).json({
    error: { code: "RATE_LIMITED", message: "Too many requests, please try again later." },
  });
}

/** General guard for the whole /api surface. */
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // The server may sit behind the Next.js proxy locally or on Vercel;
  // without `trust proxy` the socket address is used, and this disables
  // express-rate-limit's X-Forwarded-For validation error.
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => rateLimitedResponse(res),
});

/** Stricter guard for the mutations that create membership or submissions. */
export const roomMutationRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => rateLimitedResponse(res),
});
