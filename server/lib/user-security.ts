import { TRPCError } from "@trpc/server";
import type { User } from "../../db/schema.js";

export function accountSessionAllowed(user: Pick<User, "disabledAt" | "sessionVersion">, tokenVersion: number) {
  return !user.disabledAt && user.sessionVersion === tokenVersion;
}

export function isOwnEmployee(user: Pick<User, "employeeId">, employeeId: number) {
  return user.employeeId !== null && user.employeeId === employeeId;
}

export function isDemoAccount(user: Pick<User, "unionId" | "username">) {
  return user.unionId.startsWith("demo:") || Boolean(user.username?.endsWith(".demo"));
}

export function demoLoginAllowed(user: Pick<User, "unionId" | "username">, demoMode: boolean) {
  return !isDemoAccount(user) || demoMode;
}

export function assertNotLastAdmin(target: Pick<User, "role" | "disabledAt">, admins: Pick<User, "disabledAt">[]) {
  if (target.role === "admin" && !target.disabledAt && admins.filter((user) => !user.disabledAt).length <= 1) {
    throw new TRPCError({ code: "CONFLICT", message: "No puedes desactivar al último administrador global." });
  }
}
