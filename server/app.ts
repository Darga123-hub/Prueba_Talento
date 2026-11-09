import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";

const app = new Hono();

app.use("/api/trpc/*", bodyLimit({ maxSize: 5 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const fetchSite = c.req.header("sec-fetch-site");
  const origin = c.req.header("origin");
  if ((fetchSite && !["same-origin", "none"].includes(fetchSite)) || (origin && origin !== new URL(c.req.url).origin)) {
    return c.json({ error: "Origen no permitido" }, 403);
  }
  return next();
});
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
