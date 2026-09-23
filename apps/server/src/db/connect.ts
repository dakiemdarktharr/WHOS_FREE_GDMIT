import mongoose from "mongoose";

let connectionPromise: Promise<void> | null = null;

/**
 * Connect to MongoDB. Connection failures reject so the bootstrapping
 * process can exit with a clear message instead of serving half-initialized.
 */
export function connectToDatabase(uri: string, dbName: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (connectionPromise) return connectionPromise;
  mongoose.set("strictQuery", true);
  connectionPromise = mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10_000,
  }).then(() => undefined).catch((error: unknown) => {
    connectionPromise = null;
    throw error;
  });
  return connectionPromise;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
  connectionPromise = null;
  transactionsSupported = null;
}

let transactionsSupported: boolean | null = null;

/**
 * Detect whether the connected topology can run multi-document transactions:
 * replica sets (`hello.setName`) and sharded clusters (`msg: "isdbgrid"`)
 * support them, standalone servers do not. Cached after the first check.
 *
 * mongoose 8's `connection.transaction()` always runs a real transaction
 * and fails against standalone servers, so the submit service falls back
 * to sequential idempotent writes when this returns false, per
 * docs/DATABASE_SCHEMA.md.
 */
export async function supportsTransactions(): Promise<boolean> {
  if (transactionsSupported !== null) return transactionsSupported;
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  transactionsSupported = typeof hello.setName === "string" || hello.msg === "isdbgrid";
  return transactionsSupported;
}

export function databaseState(): "connected" | "connecting" | "disconnected" {
  switch (mongoose.connection.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    default:
      return "disconnected";
  }
}
