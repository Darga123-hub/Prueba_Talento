import { TRPCError } from "@trpc/server";

export const movementTransitions: Record<string, string[]> = {
  borrador: ["pendiente", "anulado"],
  pendiente: ["aprobado", "rechazado", "anulado"],
};
export const incidentTransitions: Record<string, string[]> = {
  pendiente: ["aprobada", "rechazada", "anulada"],
};
export const processTransitions: Record<string, string[]> = {
  borrador: ["pendiente", "anulado"],
  pendiente: ["aprobado", "rechazado", "anulado"],
  aprobado: ["procesado"],
};

export function assertUpdated(rows: unknown[]) {
  if (!rows.length) throw new TRPCError({ code: "CONFLICT", message: "El registro cambió; actualiza e inténtalo de nuevo." });
}

export function assertTransition(transitions: Record<string, string[]>, current: string, next: string) {
  if (!transitions[current]?.includes(next)) {
    throw new TRPCError({ code: "CONFLICT", message: `No se permite cambiar de ${current} a ${next}.` });
  }
}
