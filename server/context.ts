import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { parse } from "cookie";
import { and, eq, isNull } from "drizzle-orm";
import { authSessions, users, type User } from "../db/schema.js";
import { getDb } from "./queries/connection.js";
import { accountSessionAllowed } from "./lib/user-security.js";
import { hashSessionId, isSessionValid, readSessionToken, SESSION_COOKIE } from "./session.js";

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  let user: User | null = null;
  let sessionHash: string | null = null;
  const token = parse(req.headers.get("cookie") ?? "")[SESSION_COOKIE];
  if (token) {
    const claims = await readSessionToken(token);
    if (claims) {
      const idHash = hashSessionId(claims.sid);
      const [session] = await getDb().select().from(authSessions).where(and(eq(authSessions.idHash, idHash), isNull(authSessions.revokedAt))).limit(1);
      const now = Date.now();
      if (session && isSessionValid(session, claims, now)) {
        const [row] = await getDb().select().from(users).where(and(eq(users.unionId, claims.unionId), eq(users.sessionVersion, claims.sessionVersion))).limit(1);
        if (row && accountSessionAllowed(row, claims.sessionVersion)) {
          user = row;
          sessionHash = idHash;
          if (now - session.lastSeenAt.getTime() > 60_000) {
            await getDb().update(authSessions).set({ lastSeenAt: new Date(now) }).where(eq(authSessions.idHash, idHash));
          }
        }
      }
    }
  }
  return { req, resHeaders, user, sessionHash };
}

export type TrpcContext = Awaited<ReturnType<typeof createContext>>;
