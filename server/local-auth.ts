import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

export const passwordPolicy = z.string().min(12, "La contraseña debe tener al menos 12 caracteres.").max(128)
  .regex(/[a-z]/, "Debe incluir una letra minúscula.")
  .regex(/[A-Z]/, "Debe incluir una letra mayúscula.")
  .regex(/[0-9]/, "Debe incluir un número.")
  .regex(/[^A-Za-z0-9]/, "Debe incluir un símbolo.");

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(derived, expected);
}
