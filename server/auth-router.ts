import * as cookie from "cookie";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { users, type User } from "../db/schema.js";
import { getDb } from "./queries/connection.js";
import { signSessionToken, sessionCookieOptions, SESSION_COOKIE } from "./session.js";
import { verifyPassword } from "./local-auth.js";
import { createRouter, authedQuery, publicQuery } from "./middleware.js";

function publicUser(user: User) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export const authRouter = createRouter({
  me: authedQuery.query(({ ctx }) => publicUser(ctx.user)),
  login: publicQuery
    .input(z.object({ username: z.string().trim().min(3).max(80), password: z.string().min(8).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await getDb().select().from(users).where(eq(users.username, input.username.toLowerCase())).limit(1);
      if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuario o contraseña incorrectos." });
      }
      const token = await signSessionToken(user.unionId);
      ctx.resHeaders.append("set-cookie", cookie.serialize(SESSION_COOKIE, token, sessionCookieOptions()));
      await getDb().update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
      return publicUser(user);
    }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    ctx.resHeaders.append("set-cookie", cookie.serialize(SESSION_COOKIE, "", sessionCookieOptions(0)));
    return { success: true };
  }),
});
