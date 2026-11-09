import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context.js";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const data = { ...shape.data };
    delete data.stack;
    if (error.code === "INTERNAL_SERVER_ERROR") {
      console.error("Fallo en procedimiento tRPC", error.cause ?? error.message);
      return { ...shape, message: "No se pudo completar la operación.", data };
    }
    return { ...shape, data };
  },
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.sessionHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Debes iniciar sesión." });
  return next({ ctx: { ...ctx, user: ctx.user, sessionHash: ctx.sessionHash } });
});

export const authedQuery = t.procedure.use(requireAuth);
