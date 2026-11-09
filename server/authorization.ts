import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { accessProfiles } from "../db/schema.js";
import type { TrpcContext } from "./context.js";
import { getDb } from "./queries/connection.js";
import { writeAudit } from "./lib/audit.js";
import { isOwnEmployee } from "./lib/user-security.js";

export type Ctx = TrpcContext & { user: NonNullable<TrpcContext["user"]> };
export type Role = "administrador" | "talento" | "nomina" | "aprobador" | "tesoreria" | "consulta" | "trabajador";

export const READ_ROLES: Role[] = ["talento", "nomina", "aprobador", "tesoreria", "consulta"];
export const EMPLOYEE_READ_ROLES: Role[] = [...READ_ROLES, "trabajador"];

async function deny(ctx: Ctx, entity: string, message = "Tu perfil no tiene permiso para esta operación."): Promise<never> {
  await writeAudit({ user: ctx.user, action: "ACCESO_DENEGADO", entity });
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export async function currentRole(ctx: Ctx): Promise<Role> {
  if (ctx.user.disabledAt) await deny(ctx, "Cuenta", "La cuenta está desactivada.");
  if (ctx.user.role === "admin") return "administrador";
  const [profile] = await getDb().select({ rrhhRole: accessProfiles.rrhhRole, active: accessProfiles.active }).from(accessProfiles).where(eq(accessProfiles.userId, ctx.user.id)).limit(1);
  if (profile && !profile.active) await deny(ctx, "Perfil", "El perfil está desactivado.");
  return profile?.rrhhRole ?? "consulta";
}

export async function permit(ctx: Ctx, roles: Role[], entity = "Operación") {
  const role = await currentRole(ctx);
  if (role !== "administrador" && !roles.includes(role)) await deny(ctx, entity);
  return role;
}

export function assertGlobalAdmin(user: Pick<Ctx["user"], "role">) {
  if (user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Solo un administrador global puede gestionar usuarios." });
}

export async function requireGlobalAdmin(ctx: Ctx) {
  await currentRole(ctx);
  try { assertGlobalAdmin(ctx.user); } catch { await deny(ctx, "Administración", "Solo un administrador global puede gestionar usuarios."); }
}

export async function assertEmployeeAccess(ctx: Ctx, role: Role, employeeId: number) {
  if (role !== "trabajador") return;
  if (!ctx.user.employeeId) await deny(ctx, "Expediente propio", "La cuenta no tiene un expediente vinculado.");
  if (!isOwnEmployee(ctx.user, employeeId)) await deny(ctx, "Expediente propio", "No puedes acceder a este expediente.");
}
