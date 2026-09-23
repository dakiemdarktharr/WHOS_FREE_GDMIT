const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createPlanCode(random = Math.random): string {
  return Array.from({ length: 5 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("");
}

export function normalizePlanCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, "").slice(0, 5);
}
