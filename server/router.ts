import { authRouter } from "./auth-router.js";
import { createRouter, publicQuery } from "./middleware.js";
import { hrRouter } from "./hr-router.js";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  hr: hrRouter,
});

export type AppRouter = typeof appRouter;
