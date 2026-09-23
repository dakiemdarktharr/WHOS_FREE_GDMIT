import { randomInt } from "node:crypto";

/** Room codes are exactly five numeric characters: 00000..99999. */
export const ROOM_CODE_PATTERN = /^\d{5}$/;

const ROOM_CODE_LENGTH = 5;
const MAX_GENERATION_ATTEMPTS = 10;

/** Cryptographically secure uniform five-digit code. */
export function generateRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Generate a code and attempt to persist it through `insert`.
 *
 * The database unique index is the final collision guard: duplicate-key
 * insertions (Mongo error code 11000) are retried with a fresh code, and the
 * error is surfaced only when every attempt collides.
 */
export async function generateUniqueRoomCode(
  insert: (roomCode: string) => Promise<unknown>,
  maxAttempts: number = MAX_GENERATION_ATTEMPTS,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const roomCode = generateRoomCode();
    try {
      await insert(roomCode);
      return roomCode;
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }
  // Unreachable: the loop either returns or throws on its final iteration.
  throw new Error("Unable to generate a unique room code.");
}
