import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { hrRouter } from "./hr-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  hr: hrRouter,
});

export type AppRouter = typeof appRouter;
