import { createHmac } from "node:crypto";
import { inArray, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { loginAttempts } from "../db/schema.js";
import { env } from "./lib/env.js";
import { getDb } from "./queries/connection.js";

const WINDOW_MS = 15 * 60_000;
const RETENTION_MS = 24 * 60 * 60_000;
export const LOGIN_LIMITS = { ip: 20, account: 5 } as const;

function digest(value: string) {
  return createHmac("sha256", env.sessionSecret).update(value).digest("hex");
}

export function loginKeys(req: Request, username: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return { ip: digest(`ip:${ip}`), account: digest(`account:${ip}\0${username.toLowerCase()}`), ipHash: digest(`audit:${ip}`) };
}

function blocked() {
  return new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera antes de volver a intentarlo." });
}

export function assertLoginRowsAllowed(rows: { blockedUntil: Date | null }[], now = Date.now()) {
  if (rows.some((row) => row.blockedUntil && row.blockedUntil.getTime() > now)) throw blocked();
}

export async function assertLoginAllowed(keys: { ip: string; account: string }) {
  const rows = await getDb().select().from(loginAttempts).where(inArray(loginAttempts.keyHash, [keys.ip, keys.account]));
  assertLoginRowsAllowed(rows);
}

export function loginBlockMinutes(scope: "ip" | "account", failures: number) {
  if (failures < LOGIN_LIMITS[scope]) return 0;
  const extra = failures - LOGIN_LIMITS[scope];
  return Math.min(60, (scope === "account" ? 5 : 15) * 2 ** extra);
}

async function recordFailure(keyHash: string, scope: "ip" | "account") {
  const db = getDb();
  const now = new Date();
  const [row] = await db.insert(loginAttempts).values({ keyHash, scope, failures: 1 }).onConflictDoUpdate({
    target: loginAttempts.keyHash,
    set: {
      failures: sql`CASE WHEN ${loginAttempts.windowStartedAt} < ${new Date(Date.now() - WINDOW_MS)} THEN 1 ELSE ${loginAttempts.failures} + 1 END`,
      windowStartedAt: sql`CASE WHEN ${loginAttempts.windowStartedAt} < ${new Date(Date.now() - WINDOW_MS)} THEN ${now} ELSE ${loginAttempts.windowStartedAt} END`,
      blockedUntil: sql`CASE WHEN ${loginAttempts.windowStartedAt} < ${new Date(Date.now() - WINDOW_MS)} THEN NULL ELSE ${loginAttempts.blockedUntil} END`,
      updatedAt: now,
    },
  }).returning({ failures: loginAttempts.failures, windowStartedAt: loginAttempts.windowStartedAt });
  const failures = row?.failures ?? 1;
  const minutes = loginBlockMinutes(scope, failures);
  if (minutes > 0) {
    await db.update(loginAttempts).set({ blockedUntil: new Date(Date.now() + minutes * 60_000) }).where(sql`${loginAttempts.keyHash} = ${keyHash}`);
    return true;
  }
  return false;
}

export async function recordLoginFailure(keys: { ip: string; account: string }) {
  const [ipBlocked, accountBlocked] = await Promise.all([
    recordFailure(keys.ip, "ip"),
    recordFailure(keys.account, "account"),
  ]);
  return ipBlocked || accountBlocked;
}

export async function clearLoginFailures(keys: { ip: string; account: string }) {
  const db = getDb();
  await db.delete(loginAttempts).where(inArray(loginAttempts.keyHash, [keys.ip, keys.account]));
  await db.delete(loginAttempts).where(lt(loginAttempts.updatedAt, new Date(Date.now() - RETENTION_MS)));
}
