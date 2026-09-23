import mongoose from "mongoose";

/**
 * Connect to MongoDB. Connection failures reject so the bootstrapping
 * process can exit with a clear message instead of serving half-initialized.
 */
export async function connectToDatabase(uri: string, dbName: string): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10_000,
  });
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
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
