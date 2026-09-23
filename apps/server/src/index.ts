import { createServer, type Server as HttpServer } from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";
import { connectToDatabase, disconnectFromDatabase } from "./db/connect.js";
import { closeSocketServer, initSocketServer } from "./socket/index.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  await connectToDatabase(env.MONGODB_URI, env.MONGODB_DB);

  const server: HttpServer = createServer(app);
  initSocketServer(server);

  server.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] received ${signal}, shutting down`);

    const deadline = setTimeout(() => {
      console.error("[server] shutdown deadline exceeded, exiting");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    deadline.unref();

    server.close(async () => {
      try {
        await closeSocketServer();
        await disconnectFromDatabase();
        console.log("[server] shutdown complete");
        process.exit(0);
      } catch (error) {
        console.error("[server] shutdown failed:", error);
        process.exit(1);
      }
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[server] failed to start:", error);
  process.exit(1);
});
