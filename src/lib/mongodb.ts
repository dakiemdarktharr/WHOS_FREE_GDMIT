import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {};

if (!uri) {
  console.warn("MONGODB_URI is not configured; API routes will return a setup error until MongoDB is connected.");
}

declare global {
  // eslint-disable-next-line no-var
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!global.mongoClientPromise) global.mongoClientPromise = new MongoClient(uri, options).connect();
  return global.mongoClientPromise;
}

export async function getDatabase() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB ?? "whos_free");
}
