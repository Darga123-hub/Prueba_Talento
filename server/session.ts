import { SignJWT, jwtVerify } from "jose";
import { env } from "./lib/env";

export const SESSION_COOKIE = "rrhh_sid";
export const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

export async function signSessionToken(unionId: string): Promise<string> {
  return new SignJWT({ unionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(unionId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(encoder.encode(env.sessionSecret));
}

export async function readSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.sessionSecret), { algorithms: ["HS256"] });
    return typeof payload.unionId === "string" ? payload.unionId : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_SECONDS) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: env.isProduction,
    maxAge,
  };
}
