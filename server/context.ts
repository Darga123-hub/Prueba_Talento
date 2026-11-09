import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { parse } from "cookie";
import { eq } from "drizzle-orm";
import { users, type User } from "../db/schema";
import { getDb } from "./queries/connection";
import { readSessionToken, SESSION_COOKIE } from "./session";

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  let user: User | null = null;
  const token = parse(req.headers.get("cookie") ?? "")[SESSION_COOKIE];
  if (token) {
    const unionId = await readSessionToken(token);
    if (unionId) {
      const [row] = await getDb().select().from(users).where(eq(users.unionId, unionId)).limit(1);
      user = row ?? null;
    }
  }
  return { req, resHeaders, user };
}

export type TrpcContext = Awaited<ReturnType<typeof createContext>>;
