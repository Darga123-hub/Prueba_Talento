import * as cookie from "cookie";
import { eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLogs, authSessions, users } from "../db/schema.js";
import { getDb } from "./queries/connection.js";
import { hashSessionId, newSessionId, sessionCookieOptions, SESSION_COOKIE, SESSION_SECONDS, signSessionToken } from "./session.js";
import { verifyPassword } from "./local-auth.js";
import { createRouter, authedQuery, publicQuery } from "./middleware.js";
import { publicUser } from "./lib/public-user.js";
import { env } from "./lib/env.js";
import { writeAudit } from "./lib/audit.js";
import { assertLoginAllowed, clearLoginFailures, loginKeys, recordLoginFailure } from "./login-rate-limit.js";
import { demoLoginAllowed } from "./lib/user-security.js";

const AUTH_MESSAGE = "Usuario o contraseña incorrectos.";
const DUMMY_HASH = `scrypt$00${"00".repeat(64)}`;

export const authRouter = createRouter({
  me: authedQuery.query(({ ctx }) => publicUser(ctx.user)),
  login: publicQuery
    .input(z.object({ username: z.string().trim().min(3).max(80), password: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const username = input.username.toLowerCase();
      const keys = loginKeys(ctx.req, username);
      try {
        await assertLoginAllowed(keys);
      } catch (error) {
        await writeAudit({ action: "LOGIN_BLOQUEO", entity: "Sesión", metadata: { ipHash: keys.ipHash } });
        throw error;
      }
      const [user] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
      const validPassword = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user?.passwordHash || !validPassword || user.disabledAt || !demoLoginAllowed(user, env.demoMode)) {
        const isBlocked = await recordLoginFailure(keys);
        await writeAudit({ action: isBlocked ? "LOGIN_BLOQUEO" : "LOGIN_FALLIDO", entity: "Sesión", metadata: { ipHash: keys.ipHash } });
        if (isBlocked) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera antes de volver a intentarlo." });
        throw new TRPCError({ code: "UNAUTHORIZED", message: AUTH_MESSAGE });
      }

      const db = getDb();
      const sid = newSessionId();
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.insert(authSessions).values({ idHash: hashSessionId(sid), userId: user.id, sessionVersion: user.sessionVersion, expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000) });
        await tx.update(users).set({ lastSignInAt: now }).where(eq(users.id, user.id));
        await tx.delete(authSessions).where(lt(authSessions.expiresAt, now));
        await tx.delete(auditLogs).where(lt(auditLogs.createdAt, new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000)));
      });
      await clearLoginFailures(keys);
      await writeAudit({ user, action: "LOGIN_OK", entity: "Sesión", metadata: { ipHash: keys.ipHash } });
      const token = await signSessionToken({ unionId: user.unionId, sid, sessionVersion: user.sessionVersion });
      ctx.resHeaders.append("set-cookie", cookie.serialize(SESSION_COOKIE, token, sessionCookieOptions()));
      return publicUser(user);
    }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    await getDb().update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.idHash, ctx.sessionHash));
    await writeAudit({ user: ctx.user, action: "LOGOUT", entity: "Sesión" });
    ctx.resHeaders.append("set-cookie", cookie.serialize(SESSION_COOKIE, "", sessionCookieOptions(0)));
    return { success: true };
  }),
});
