import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { storage } from "./lib/storage";
import {
  accessProfiles, employees, catalogItems, movements, incidents, concepts,
  payrolls, payrollItems, payments, processes, legalParameters, documents,
  auditLogs, users,
} from "../db/schema";
import type { TrpcContext } from "./context";

type Ctx = TrpcContext & { user: NonNullable<TrpcContext["user"]> };
type Role = "administrador" | "talento" | "nomina" | "aprobador" | "tesoreria" | "consulta" | "trabajador";
const money = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const num = (v: unknown) => Number(v ?? 0);

async function currentRole(ctx: Ctx): Promise<Role> {
  if (ctx.user.role === "admin") return "administrador";
  const [profile] = await getDb().select().from(accessProfiles).where(eq(accessProfiles.userId, ctx.user.id)).limit(1);
  return profile?.active ? profile.rrhhRole : "consulta";
}
async function permit(ctx: Ctx, roles: Role[]) {
  const role = await currentRole(ctx);
  if (role !== "administrador" && !roles.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tu perfil no tiene permiso para esta operación." });
  }
  return role;
}
async function audit(ctx: Ctx, action: string, entity: string, entityId?: string | number, detail?: string) {
  await getDb().insert(auditLogs).values({ userId: ctx.user.id, userName: ctx.user.name, action, entity, entityId: entityId?.toString(), detail });
}
const employeeInput = z.object({
  documentId: z.string().trim().min(5).max(24).regex(/^[A-Za-z0-9-]+$/, "Usa solo letras, números y guiones."),
  firstName: z.string().trim().min(2).max(100), lastName: z.string().trim().min(2).max(100),
  email: z.union([z.literal(""), z.string().email()]).optional(), phone: z.string().max(40).optional(),
  birthDate: z.string().optional(), hireDate: z.string().min(8),
  department: z.string().trim().min(2), position: z.string().trim().min(2),
  personnelType: z.enum(["carrera", "libre", "alto_nivel", "contratado", "obrero", "comisionado", "jubilado", "pensionado"]),
  regime: z.string().default("General"), status: z.enum(["activo", "suspendido", "vacaciones", "egresado"]).default("activo"),
  baseSalary: z.coerce.number().min(0), integralSalary: z.coerce.number().min(0).default(0),
  bankName: z.string().max(120).optional(), bankAccount: z.string().max(34).optional(),
  dependents: z.coerce.number().int().min(0).max(30).default(0), address: z.string().max(2000).optional(),
  education: z.string().max(180).optional(), notes: z.string().max(4000).optional(),
});
function employeeValues(input: z.infer<typeof employeeInput>) {
  return {
    ...input, email: input.email || null, phone: input.phone || null, birthDate: input.birthDate ? new Date(input.birthDate) : null, hireDate: new Date(input.hireDate),
    bankName: input.bankName || null, bankAccountLast4: input.bankAccount?.replace(/\s/g, "").slice(-4) || null,
    baseSalary: money(input.baseSalary), integralSalary: money(input.integralSalary),
    address: input.address || null, education: input.education || null, notes: input.notes || null,
    bankAccount: undefined,
  };
}
const statusInput = z.object({ id: z.number().int().positive(), status: z.string().min(2), reason: z.string().max(1000).optional() });

export const hrRouter = createRouter({
  session: authedQuery.query(async ({ ctx }) => ({ user: ctx.user, role: await currentRole(ctx) })),

  dashboard: authedQuery.query(async () => {
    const db = getDb();
    const [people, payrollRows, processRows, activity] = await Promise.all([
      db.select().from(employees), db.select().from(payrolls).orderBy(desc(payrolls.createdAt)).limit(8),
      db.select().from(processes).orderBy(desc(processes.createdAt)).limit(20),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(4),
    ]);
    const active = people.filter((p) => p.status === "activo");
    const byDepartment = Object.values(active.reduce<Record<string, { name: string; count: number }>>((a, p) => {
      a[p.department] ??= { name: p.department, count: 0 }; a[p.department].count++; return a;
    }, {})).sort((a, b) => b.count - a.count);
    return {
      counts: { active: active.length, total: people.length, pending: processRows.filter((p) => p.status === "pendiente").length,
        openPayrolls: payrollRows.filter((p) => !["pagada", "anulada"].includes(p.status)).length },
      payrolls: payrollRows, activity, byDepartment,
      monthlyNet: payrollRows.filter((p) => p.status === "pagada").reduce((s, p) => s + num(p.totalNet), 0),
    };
  }),

  employees: createRouter({
    list: authedQuery.input(z.object({ search: z.string().optional(), status: z.string().optional() }).optional()).query(async ({ input }) => {
      const rows = await getDb().select().from(employees).orderBy(employees.lastName, employees.firstName);
      const search = input?.search?.toLowerCase().trim();
      return rows.filter((p) => (!search || `${p.firstName} ${p.lastName} ${p.documentId} ${p.department} ${p.position}`.toLowerCase().includes(search)) && (!input?.status || input.status === "todos" || p.status === input.status));
    }),
    get: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = getDb(); const [employee] = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Expediente no encontrado." });
      const [docs, movs, incs, procs, receipts] = await Promise.all([
        db.select().from(documents).where(eq(documents.employeeId, input.id)).orderBy(desc(documents.createdAt)),
        db.select().from(movements).where(eq(movements.employeeId, input.id)).orderBy(desc(movements.createdAt)),
        db.select().from(incidents).where(eq(incidents.employeeId, input.id)).orderBy(desc(incidents.createdAt)),
        db.select().from(processes).where(eq(processes.employeeId, input.id)).orderBy(desc(processes.createdAt)),
        db.select().from(payrollItems).where(eq(payrollItems.employeeId, input.id)).orderBy(desc(payrollItems.createdAt)),
      ]);
      return { employee, documents: docs, movements: movs, incidents: incs, processes: procs, receipts };
    }),
    create: authedQuery.input(employeeInput).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento"]);
      const db = getDb(); const [existing] = await db.select({ id: employees.id }).from(employees).where(eq(employees.documentId, input.documentId)).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Ya existe una persona con esa cédula o documento." });
      const [{ id }] = await db.insert(employees).values({ ...employeeValues(input), createdBy: ctx.user.id }).returning({ id: employees.id });
      await audit(ctx, "CREAR", "Expediente", id, `${input.firstName} ${input.lastName}`); return { id };
    }),
    update: authedQuery.input(employeeInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento"]); const { id, ...data } = input;
      const [existing] = await getDb().select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const values = employeeValues(data);
      if (!data.bankAccount) values.bankAccountLast4 = existing.bankAccountLast4;
      await getDb().update(employees).set(values).where(eq(employees.id, id));
      await audit(ctx, "ACTUALIZAR", "Expediente", id, `${input.firstName} ${input.lastName}`); return { ok: true };
    }),
  }),

  catalogs: createRouter({
    list: authedQuery.query(() => getDb().select().from(catalogItems).orderBy(catalogItems.category, catalogItems.name)),
    create: authedQuery.input(z.object({ category: z.string().min(2).max(60), name: z.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento", "nomina"]); const [{ id }] = await getDb().insert(catalogItems).values(input).returning({ id: catalogItems.id });
      await audit(ctx, "CREAR", "Catálogo", id, `${input.category}: ${input.name}`); return { id };
    }),
    toggle: authedQuery.input(z.object({ id: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento", "nomina"]); await getDb().update(catalogItems).set({ active: input.active }).where(eq(catalogItems.id, input.id));
      await audit(ctx, input.active ? "ACTIVAR" : "DESACTIVAR", "Catálogo", input.id); return { ok: true };
    }),
  }),

  movements: createRouter({
    list: authedQuery.query(async () => {
      const [rows, people] = await Promise.all([getDb().select().from(movements).orderBy(desc(movements.createdAt)), getDb().select().from(employees)]);
      const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
      return rows.map((r) => ({ ...r, employeeName: names.get(r.employeeId) ?? "Expediente no disponible" }));
    }),
    create: authedQuery.input(z.object({ employeeId: z.number().int().positive(), type: z.string().min(2), effectiveDate: z.string().min(8), description: z.string().trim().min(3).max(3000) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento"]); const [{ id }] = await getDb().insert(movements).values({ ...input, effectiveDate: new Date(input.effectiveDate), createdBy: ctx.user.id }).returning({ id: movements.id });
      await audit(ctx, "CREAR", "Movimiento", id, input.type); return { id };
    }),
    status: authedQuery.input(statusInput).mutation(async ({ ctx, input }) => {
      await permit(ctx, input.status === "aprobado" ? ["aprobador"] : ["talento"]);
      if (!["aprobado", "rechazado", "anulado", "pendiente"].includes(input.status)) throw new TRPCError({ code: "BAD_REQUEST" });
      await getDb().update(movements).set({ status: input.status as "aprobado" | "rechazado" | "anulado" | "pendiente" }).where(eq(movements.id, input.id));
      await audit(ctx, input.status.toUpperCase(), "Movimiento", input.id, input.reason); return { ok: true };
    }),
  }),

  incidents: createRouter({
    list: authedQuery.query(async () => {
      const [rows, people] = await Promise.all([getDb().select().from(incidents).orderBy(desc(incidents.createdAt)), getDb().select().from(employees)]);
      const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
      return rows.map((r) => ({ ...r, employeeName: names.get(r.employeeId) ?? "Expediente no disponible" }));
    }),
    create: authedQuery.input(z.object({ employeeId: z.number().int().positive(), type: z.string().min(2), startDate: z.string().min(8), endDate: z.string().min(8), quantity: z.coerce.number().min(0), unit: z.string().min(1), amount: z.coerce.number().min(0), description: z.string().max(3000).optional() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento", "nomina"]); if (input.endDate < input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha final no puede ser anterior al inicio." });
      const [{ id }] = await getDb().insert(incidents).values({ ...input, startDate: new Date(input.startDate), endDate: new Date(input.endDate), quantity: money(input.quantity), amount: money(input.amount), createdBy: ctx.user.id }).returning({ id: incidents.id });
      await audit(ctx, "CREAR", "Incidencia", id, input.type); return { id };
    }),
    status: authedQuery.input(statusInput).mutation(async ({ ctx, input }) => {
      await permit(ctx, input.status === "aprobada" ? ["aprobador"] : ["talento", "nomina"]);
      if (!["aprobada", "rechazada", "anulada", "pendiente"].includes(input.status)) throw new TRPCError({ code: "BAD_REQUEST" });
      await getDb().update(incidents).set({ status: input.status as "aprobada" | "rechazada" | "anulada" | "pendiente" }).where(eq(incidents.id, input.id));
      await audit(ctx, input.status.toUpperCase(), "Incidencia", input.id, input.reason); return { ok: true };
    }),
  }),

  concepts: createRouter({
    list: authedQuery.query(() => getDb().select().from(concepts).orderBy(concepts.kind, concepts.code)),
    create: authedQuery.input(z.object({ code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/), name: z.string().trim().min(2), kind: z.enum(["asignacion", "deduccion", "aporte", "informativo"]), calcMethod: z.enum(["fijo", "porcentaje", "por_hijo"]), value: z.coerce.number().min(0), base: z.enum(["normal", "integral"]) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["nomina"]); const [{ id }] = await getDb().insert(concepts).values({ ...input, value: input.value.toFixed(4) }).returning({ id: concepts.id });
      await audit(ctx, "CREAR", "Concepto", id, input.code); return { id };
    }),
    update: authedQuery.input(z.object({ id: z.number().int().positive(), value: z.coerce.number().min(0), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["nomina"]); const [old] = await getDb().select().from(concepts).where(eq(concepts.id, input.id)).limit(1);
      await getDb().update(concepts).set({ value: input.value.toFixed(4), active: input.active, version: (old?.version ?? 0) + 1 }).where(eq(concepts.id, input.id));
      await audit(ctx, "VERSIONAR", "Concepto", input.id, `Versión ${(old?.version ?? 0) + 1}`); return { ok: true };
    }),
    simulate: authedQuery.input(z.object({ calcMethod: z.enum(["fijo", "porcentaje", "por_hijo"]), value: z.coerce.number().min(0), salary: z.coerce.number().min(0), dependents: z.coerce.number().int().min(0).default(0) })).query(({ input }) => {
      const amount = input.calcMethod === "fijo" ? input.value : input.calcMethod === "porcentaje" ? input.salary * input.value / 100 : input.value * input.dependents;
      const explanation = input.calcMethod === "fijo" ? `Monto fijo: ${money(input.value)}` : input.calcMethod === "porcentaje" ? `${money(input.salary)} × ${input.value}%` : `${money(input.value)} × ${input.dependents} derechohabientes`;
      return { amount: money(amount), explanation };
    }),
  }),

  payroll: createRouter({
    list: authedQuery.query(async () => {
      const [rows, paymentRows] = await Promise.all([getDb().select().from(payrolls).orderBy(desc(payrolls.createdAt)), getDb().select().from(payments)]);
      return rows.map((p) => ({ ...p, payment: paymentRows.find((x) => x.payrollId === p.id) ?? null }));
    }),
    get: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const [payroll] = await getDb().select().from(payrolls).where(eq(payrolls.id, input.id)).limit(1);
      if (!payroll) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await getDb().select().from(payrollItems).where(eq(payrollItems.payrollId, input.id)).orderBy(payrollItems.employeeName);
      return { payroll, items };
    }),
    create: authedQuery.input(z.object({ name: z.string().trim().min(3).max(160), type: z.enum(["ordinaria", "especial", "vacaciones", "fin_ano", "prestaciones", "ajuste"]), periodStart: z.string().min(8), periodEnd: z.string().min(8) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["nomina"]); if (input.periodEnd < input.periodStart) throw new TRPCError({ code: "BAD_REQUEST", message: "El período no es válido." });
      const db = getDb(); const [people, activeConcepts] = await Promise.all([db.select().from(employees).where(eq(employees.status, "activo")), db.select().from(concepts).where(eq(concepts.active, true))]);
      if (!people.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Registra al menos un expediente activo antes de calcular." });
      const calculated = people.map((person) => {
        const salary = num(person.baseSalary); let extraAssignments = 0, deductions = 0;
        const lines: { name: string; kind: string; amount: string; explanation: string }[] = [{ name: "Salario base", kind: "asignacion", amount: money(salary), explanation: "Base normal registrada en el expediente" }];
        activeConcepts.forEach((c) => {
          const base = c.base === "integral" && num(person.integralSalary) > 0 ? num(person.integralSalary) : salary;
          const value = num(c.value); const raw = c.calcMethod === "fijo" ? value : c.calcMethod === "porcentaje" ? base * value / 100 : value * person.dependents;
          const explanation = c.calcMethod === "fijo" ? `Monto fijo · versión ${c.version}` : c.calcMethod === "porcentaje" ? `${money(base)} × ${value}% · versión ${c.version}` : `${money(value)} × ${person.dependents} derechohabientes · versión ${c.version}`;
          lines.push({ name: c.name, kind: c.kind, amount: money(raw), explanation });
          if (c.kind === "asignacion") extraAssignments += raw; if (c.kind === "deduccion") deductions += raw;
        });
        const assignments = salary + extraAssignments;
        return { employeeId: person.id, employeeName: `${person.firstName} ${person.lastName}`, documentId: person.documentId, baseSalary: money(salary), assignments: money(assignments), deductions: money(deductions), net: money(assignments - deductions), details: lines };
      });
      const totals = calculated.reduce((a, i) => ({ assignments: a.assignments + num(i.assignments), deductions: a.deductions + num(i.deductions), net: a.net + num(i.net) }), { assignments: 0, deductions: 0, net: 0 });
      const code = `NOM-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;
      const id = await db.transaction(async (tx) => {
        const [{ id: payrollId }] = await tx.insert(payrolls).values({ ...input, periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd), code, totalAssignments: money(totals.assignments), totalDeductions: money(totals.deductions), totalNet: money(totals.net), createdBy: ctx.user.id }).returning({ id: payrolls.id });
        await tx.insert(payrollItems).values(calculated.map((i) => ({ ...i, payrollId }))); return payrollId;
      });
      await audit(ctx, "CALCULAR", "Nómina", id, `${code} · ${calculated.length} recibos`); return { id, code };
    }),
    transition: authedQuery.input(z.object({ id: z.number().int().positive(), action: z.enum(["revision", "aprobar", "cerrar", "anular", "reabrir"]), reason: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = getDb(); const [p] = await db.select().from(payrolls).where(eq(payrolls.id, input.id)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      let status: "revision" | "aprobada" | "cerrada" | "anulada" | "reabierta";
      if (input.action === "revision") { await permit(ctx, ["nomina"]); if (!["borrador", "reabierta"].includes(p.status)) throw new TRPCError({ code: "CONFLICT", message: "Solo un borrador o una nómina reabierta puede enviarse a revisión." }); status = "revision"; }
      else if (input.action === "aprobar") { await permit(ctx, ["aprobador"]); if (p.status !== "revision") throw new TRPCError({ code: "CONFLICT", message: "La nómina debe estar en revisión." }); if (p.createdBy === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "La aprobación debe realizarla una persona distinta de quien calculó." }); status = "aprobada"; }
      else if (input.action === "cerrar") { await permit(ctx, ["nomina"]); if (p.status !== "aprobada") throw new TRPCError({ code: "CONFLICT", message: "La nómina debe estar aprobada antes del cierre." }); status = "cerrada"; }
      else if (input.action === "anular") { await permit(ctx, ["nomina"]); if (!["borrador", "revision"].includes(p.status)) throw new TRPCError({ code: "CONFLICT", message: "Una nómina aprobada o cerrada no se anula; genera una nómina de ajuste." }); if (!input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Indica el motivo de anulación." }); status = "anulada"; }
      else { if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" }); if (p.status !== "cerrada") throw new TRPCError({ code: "CONFLICT" }); if (!input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Indica el motivo de reapertura." }); status = "reabierta"; }
      await db.update(payrolls).set({ status, approvedBy: input.action === "aprobar" ? ctx.user.id : p.approvedBy, closedAt: input.action === "cerrar" ? new Date() : p.closedAt }).where(and(eq(payrolls.id, input.id), eq(payrolls.status, p.status)));
      await audit(ctx, input.action.toUpperCase(), "Nómina", input.id, input.reason); return { ok: true };
    }),
    pay: authedQuery.input(z.object({ id: z.number().int().positive(), method: z.enum(["transferencia", "archivo_bancario", "cheque"]), reference: z.string().trim().min(3).max(100), paidAt: z.string().min(8) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["tesoreria"]); const db = getDb(); const [p] = await db.select().from(payrolls).where(eq(payrolls.id, input.id)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" }); if (p.status === "pagada") return { ok: true, idempotent: true };
      if (p.status !== "cerrada") throw new TRPCError({ code: "CONFLICT", message: "Solo una nómina cerrada puede registrarse como pagada." });
      const [existing] = await db.select().from(payments).where(eq(payments.payrollId, input.id)).limit(1); if (existing) return { ok: true, idempotent: true };
      await db.transaction(async (tx) => { await tx.insert(payments).values({ payrollId: input.id, method: input.method, reference: input.reference, paidAt: new Date(input.paidAt), registeredBy: ctx.user.id }); await tx.update(payrolls).set({ status: "pagada" }).where(eq(payrolls.id, input.id)); });
      await audit(ctx, "PAGAR", "Nómina", input.id, `${input.method} · ${input.reference}`); return { ok: true, idempotent: false };
    }),
  }),

  processes: createRouter({
    list: authedQuery.query(async () => {
      const [rows, people] = await Promise.all([getDb().select().from(processes).orderBy(desc(processes.createdAt)), getDb().select().from(employees)]);
      const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`])); return rows.map((r) => ({ ...r, employeeName: names.get(r.employeeId) ?? "No disponible" }));
    }),
    create: authedQuery.input(z.object({ employeeId: z.number().int().positive(), type: z.enum(["vacaciones", "vacaciones_colectivas", "fin_ano", "prestaciones", "anticipo", "liquidacion", "jubilacion", "pension", "aumento", "retroactivo"]), startDate: z.string().min(8), endDate: z.string().optional(), days: z.coerce.number().min(0), amount: z.coerce.number().min(0), description: z.string().max(3000).optional() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento", "nomina"]); const [person] = await getDb().select().from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "Selecciona un expediente válido." });
      const estimate = input.amount > 0 ? input.amount : num(person.baseSalary) / 30 * input.days;
      const calculation = { salaryBase: money(num(person.baseSalary)), days: input.days, formula: input.amount > 0 ? "Monto indicado por el operador" : "Salario base ÷ 30 × días", note: "Estimación operativa. Debe validarse con los parámetros legales y el régimen aplicable antes de aprobar." };
      const [{ id }] = await getDb().insert(processes).values({ ...input, startDate: new Date(input.startDate), endDate: input.endDate ? new Date(input.endDate) : null, days: money(input.days), amount: money(estimate), calculation, createdBy: ctx.user.id }).returning({ id: processes.id });
      await audit(ctx, "CREAR", "Proceso especial", id, input.type); return { id, amount: money(estimate) };
    }),
    status: authedQuery.input(statusInput).mutation(async ({ ctx, input }) => {
      await permit(ctx, input.status === "aprobado" ? ["aprobador"] : ["talento", "nomina"]);
      if (!["aprobado", "rechazado", "anulado", "procesado", "pendiente"].includes(input.status)) throw new TRPCError({ code: "BAD_REQUEST" });
      await getDb().update(processes).set({ status: input.status as "aprobado" | "rechazado" | "anulado" | "procesado" | "pendiente" }).where(eq(processes.id, input.id));
      await audit(ctx, input.status.toUpperCase(), "Proceso especial", input.id, input.reason); return { ok: true };
    }),
  }),

  legal: createRouter({
    list: authedQuery.query(() => getDb().select().from(legalParameters).orderBy(desc(legalParameters.effectiveDate))),
    create: authedQuery.input(z.object({ name: z.string().trim().min(3), value: z.coerce.number().min(0), unit: z.string().min(1), regime: z.string().min(2), effectiveDate: z.string().min(8), source: z.string().trim().min(3), article: z.string().optional() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento", "nomina"]); const [{ id }] = await getDb().insert(legalParameters).values({ ...input, effectiveDate: new Date(input.effectiveDate), value: input.value.toFixed(4) }).returning({ id: legalParameters.id });
      await audit(ctx, "CREAR", "Parámetro legal", id, input.name); return { id };
    }),
    validate: authedQuery.input(z.object({ id: z.number().int().positive(), status: z.enum(["pendiente", "verificado", "inactivo"]) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Solo el administrador puede cambiar la validación jurídica." });
      await getDb().update(legalParameters).set({ validationStatus: input.status }).where(eq(legalParameters.id, input.id)); await audit(ctx, "VALIDAR", "Parámetro legal", input.id, input.status); return { ok: true };
    }),
  }),

  documents: createRouter({
    upload: authedQuery.input(z.object({ employeeId: z.number().int().positive(), name: z.string().min(1).max(255), category: z.string().min(2).max(100), contentBase64: z.string().max(4_100_000), contentType: z.string().max(160).optional() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento"]); if (input.name.includes("..") || /[\\/\0]/.test(input.name)) throw new TRPCError({ code: "BAD_REQUEST", message: "Nombre de archivo no válido." });
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64")); if (bytes.length > 3_000_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "El documento no puede superar 3 MB en esta versión para Vercel." });
      const saved = await storage.uploadFile({ fileContent: bytes, fileName: `rrhh/${ctx.user.id}/${input.employeeId}/${input.name}`, contentType: input.contentType });
      const [{ id }] = await getDb().insert(documents).values({ employeeId: input.employeeId, ownerId: ctx.user.id, key: saved.key, name: input.name, category: input.category, size: saved.size, contentType: saved.contentType }).returning({ id: documents.id });
      await audit(ctx, "ADJUNTAR", "Documento", id, input.name); return { id, key: saved.key };
    }),
    url: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await permit(ctx, ["talento", "nomina", "consulta", "tesoreria"]); const [doc] = await getDb().select().from(documents).where(eq(documents.id, input.id)).limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" }); return storage.getPresignedUrl({ key: doc.key, download: true });
    }),
  }),

  users: createRouter({
    list: authedQuery.query(async ({ ctx }) => {
      await permit(ctx, []);
      const [userRows, profiles] = await Promise.all([getDb().select().from(users).orderBy(users.name), getDb().select().from(accessProfiles)]);
      return userRows.map((u) => {
        const { passwordHash: _passwordHash, ...safeUser } = u;
        return { ...safeUser, profile: profiles.find((p) => p.userId === u.id) ?? null };
      });
    }),
    setRole: authedQuery.input(z.object({ userId: z.number().int().positive(), rrhhRole: z.enum(["administrador", "talento", "nomina", "aprobador", "tesoreria", "consulta", "trabajador"]), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, []);
      await getDb().insert(accessProfiles).values({ userId: input.userId, rrhhRole: input.rrhhRole, active: input.active }).onConflictDoUpdate({ target: accessProfiles.userId, set: { rrhhRole: input.rrhhRole, active: input.active } });
      await audit(ctx, "ASIGNAR_PERFIL", "Usuario", input.userId, input.rrhhRole); return { ok: true };
    }),
  }),

  audit: createRouter({
    list: authedQuery.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
      await permit(ctx, ["consulta", "talento", "nomina"]); return getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(input?.limit ?? 100);
    }),
  }),
});
