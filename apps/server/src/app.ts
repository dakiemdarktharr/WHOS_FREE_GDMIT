import express, { type Express } from "express";
import cors from "cors";
import { corsOrigins, env } from "./config/env.js";
import { connectToDatabase } from "./db/connect.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import healthRouter from "./routes/health.js";
import roomsRouter from "./routes/rooms.js";
import schedulesRouter from "./routes/schedules.js";

/** Assemble the Express app with the documented /api surface. */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: corsOrigins() }));
  app.use(express.json({ limit: "256kb" }));

  app.use("/health", healthRouter);
  app.use("/api", apiRateLimiter);
  app.use("/api", async (_req, _res, next) => {
    try {
      await connectToDatabase(env.MONGODB_URI, env.MONGODB_DB);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/rooms", roomsRouter);
  app.use("/api/schedules", schedulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export default createApp();
