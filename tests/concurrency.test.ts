import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { idempotentPaymentOnDuplicate } from "../server/lib/database-errors.js";
import { assertTransition, assertUpdated, movementTransitions } from "../server/lib/transitions.js";

test("dos transiciones concurrentes solo permiten una actualización válida", async () => {
  let status = "revision";
  const transition = async () => {
    await Promise.resolve();
    if (status !== "revision") return [];
    status = "aprobada";
    return [{ id: 1 }];
  };
  const results = await Promise.allSettled([transition(), transition()].map(async (operation) => assertUpdated(await operation)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.equal((rejected.reason as TRPCError).code, "CONFLICT");
  assert.equal(status, "aprobada");
  assert.throws(() => assertTransition(movementTransitions, "aprobado", "pendiente"), (error: unknown) => (error as TRPCError).code === "CONFLICT");
});

test("dos pagos concurrentes producen un único pago y una respuesta idempotente", async () => {
  const payments = new Set<number>();
  const pay = async () => {
    await Promise.resolve();
    try {
      if (payments.has(1)) throw Object.assign(new Error("duplicate"), { code: "23505" });
      payments.add(1);
      return { ok: true, idempotent: false };
    } catch (error) {
      return idempotentPaymentOnDuplicate(error);
    }
  };
  const results = await Promise.all([pay(), pay()]);
  assert.equal(payments.size, 1);
  assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
});
