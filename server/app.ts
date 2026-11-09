import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";

const app = new Hono();

app.use("/api/trpc/*", bodyLimit({ maxSize: 5 * 1024 * 1024 }));
app.get("/api/health", (c) => c.json({ ok: true }));
app.use("/api/trpc/*", (c) => fetchRequestHandler({
  endpoint: "/api/trpc",
  req: c.req.raw,
  router: appRouter,
  createContext,
}));
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));
app.onError((error, c) => {
  console.error("Error de API", error);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
