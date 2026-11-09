import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./lib/env.js";

export const SESSION_COOKIE = "rrhh_sid";
export const SESSION_SECONDS = 60 * 60 * 8;
export const SESSION_IDLE_SECONDS = 60 * 60;
const encoder = new TextEncoder();

export type SessionClaims = { unionId: string; sid: string; sessionVersion: number };
export type StoredSession = { sessionVersion: number; expiresAt: Date; lastSeenAt: Date; revokedAt: Date | null };

export function isSessionValid(session: StoredSession, claims: SessionClaims, now = Date.now()) {
  return !session.revokedAt && session.sessionVersion === claims.sessionVersion
    && session.expiresAt.getTime() > now
    && now - session.lastSeenAt.getTime() <= SESSION_IDLE_SECONDS * 1000;
}

export function hashSessionId(id: string) {
  return createHash("sha256").update(id).digest("hex");
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ unionId: claims.unionId, sid: claims.sid, sv: claims.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.unionId)
    .setJti(claims.sid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(encoder.encode(env.sessionSecret));
}

export async function readSessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.sessionSecret), { algorithms: ["HS256"] });
    if (typeof payload.unionId !== "string" || typeof payload.sid !== "string" || typeof payload.sv !== "number") return null;
    return { unionId: payload.unionId, sid: payload.sid, sessionVersion: payload.sv };
  } catch {
    return null;
  }
}

export function newSessionId() {
  return randomBytes(32).toString("base64url");
}

export function sessionCookieOptions(maxAge = SESSION_SECONDS) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: env.isHttps,
    maxAge,
  };
}
