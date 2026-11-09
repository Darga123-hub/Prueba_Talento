import * as cookie from "cookie";
import { z } from "zod";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware.js";
import { getDb } from "./queries/connection.js";
import { storage } from "./lib/storage.js";
import {
  accessProfiles, employees, catalogItems, movements, incidents, concepts,
  payrolls, payrollItems, payments, processes, legalParameters, documents,
  auditLogs, users, authSessions,
} from "../db/schema.js";
import { currentRole, permit, requireGlobalAdmin, assertEmployeeAccess, EMPLOYEE_READ_ROLES, READ_ROLES, type Ctx } from "./authorization.js";
import { publicUser } from "./lib/public-user.js";
import { writeAudit } from "./lib/audit.js";
import { hashPassword, passwordPolicy, verifyPassword } from "./local-auth.js";
import { sessionCookieOptions, SESSION_COOKIE } from "./session.js";
import { assertTransition, assertUpdated, movementTransitions, incidentTransitions, processTransitions } from "./lib/transitions.js";
import { decodeDocumentBase64, validateDocument } from "./lib/file-validation.js";
import { assertNotLastAdmin } from "./lib/user-security.js";
import { idempotentPaymentOnDuplicate, isUniqueViolation } from "./lib/database-errors.js";

const money = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const num = (v: unknown) => Number(v ?? 0);

async function audit(ctx: Ctx, action: string, entity: string, entityId?: string | number, detail?: string) {
  await writeAudit({ user: ctx.user, action, entity, entityId, detail });
}
const listInput = z.object({ limit: z.number().int().min(1).max(200).default(100), offset: z.number().int().min(0).default(0) }).optional();
async function assertEmployeeExists(id: number) {
  const [employee] = await getDb().select({ id: employees.id }).from(employees).where(eq(employees.id, id)).limit(1);
  if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "El expediente vinculado no existe." });
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
  session: authedQuery.query(async ({ ctx }) => ({ user: publicUser(ctx.user), role: await currentRole(ctx), isGlobalAdmin: ctx.user.role === "admin" })),

  dashboard: authedQuery.query(async ({ ctx }) => {
    await permit(ctx, READ_ROLES, "Resumen");
    const db = getDb();
    const [people, payrollRows, processRows, activity] = await Promise.all([
      db.select({ status: employees.status, department: employees.department }).from(employees),
      db.select({ id: payrolls.id, code: payrolls.code, name: payrolls.name, periodEnd: payrolls.periodEnd, status: payrolls.status, totalNet: payrolls.totalNet, createdAt: payrolls.createdAt }).from(payrolls).orderBy(desc(payrolls.createdAt)).limit(8),
      db.select({ status: processes.status, createdAt: processes.createdAt }).from(processes).orderBy(desc(processes.createdAt)).limit(100),
      db.select({ id: auditLogs.id, userName: auditLogs.userName, action: auditLogs.action, entity: auditLogs.entity, detail: auditLogs.detail, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(4),
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
    list: authedQuery.input(z.object({ search: z.string().max(120).optional(), status: z.enum(["activo", "suspendido", "vacaciones", "egresado", "todos"]).optional(), limit: z.number().int().min(1).max(200).default(100), offset: z.number().int().min(0).default(0) }).optional()).query(async ({ ctx, input }) => {
      const role = await permit(ctx, EMPLOYEE_READ_ROLES, "Expedientes");
      if (role === "trabajador" && !ctx.user.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "La cuenta no tiene un expediente vinculado." });
      const summary = { id: employees.id, documentId: employees.documentId, firstName: employees.firstName, lastName: employees.lastName, hireDate: employees.hireDate, department: employees.department, position: employees.position, personnelType: employees.personnelType, regime: employees.regime, status: employees.status, baseSalary: employees.baseSalary, bankAccountLast4: employees.bankAccountLast4 };
      const conditions = role === "trabajador" ? [eq(employees.id, ctx.user.employeeId!)] : [];
      const search = input?.search?.trim();
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(or(ilike(employees.firstName, pattern), ilike(employees.lastName, pattern), ilike(employees.documentId, pattern), ilike(employees.department, pattern), ilike(employees.position, pattern))!);
      }
      if (input?.status && input.status !== "todos") conditions.push(eq(employees.status, input.status));
      return getDb().select(summary).from(employees).where(and(...conditions)).orderBy(employees.lastName, employees.firstName).limit(input?.limit ?? 100).offset(input?.offset ?? 0);
    }),
    get: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const role = await permit(ctx, EMPLOYEE_READ_ROLES, "Expediente");
      await assertEmployeeAccess(ctx, role, input.id);
      const db = getDb(); const [employee] = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Expediente no encontrado." });
      const [docs, movs, incs, procs, receipts] = await Promise.all([
        db.select({ id: documents.id, name: documents.name, category: documents.category, size: documents.size, contentType: documents.contentType, createdAt: documents.createdAt }).from(documents).where(eq(documents.employeeId, input.id)).orderBy(desc(documents.createdAt)).limit(100),
        db.select({ id: movements.id, type: movements.type, effectiveDate: movements.effectiveDate, description: movements.description, status: movements.status, createdAt: movements.createdAt }).from(movements).where(eq(movements.employeeId, input.id)).orderBy(desc(movements.createdAt)).limit(100),
        db.select({ id: incidents.id, type: incidents.type, startDate: incidents.startDate, description: incidents.description, status: incidents.status }).from(incidents).where(eq(incidents.employeeId, input.id)).orderBy(desc(incidents.createdAt)).limit(100),
        db.select({ id: processes.id, type: processes.type, startDate: processes.startDate, description: processes.description, status: processes.status }).from(processes).where(eq(processes.employeeId, input.id)).orderBy(desc(processes.createdAt)).limit(100),
        db.select({ id: payrollItems.id, payrollId: payrollItems.payrollId, assignments: payrollItems.assignments, deductions: payrollItems.deductions, net: payrollItems.net, createdAt: payrollItems.createdAt }).from(payrollItems).where(eq(payrollItems.employeeId, input.id)).orderBy(desc(payrollItems.createdAt)).limit(100),
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
    list: authedQuery.query(async ({ ctx }) => {
      await permit(ctx, READ_ROLES, "Catálogos");
      return getDb().select({ id: catalogItems.id, category: catalogItems.category, name: catalogItems.name, active: catalogItems.active }).from(catalogItems).orderBy(catalogItems.category, catalogItems.name).limit(500);
    }),
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
    list: authedQuery.input(listInput).query(async ({ ctx, input }) => {
      await permit(ctx, READ_ROLES, "Movimientos");
      const [rows, people] = await Promise.all([
        getDb().select({ id: movements.id, employeeId: movements.employeeId, type: movements.type, effectiveDate: movements.effectiveDate, description: movements.description, status: movements.status, createdAt: movements.createdAt }).from(movements).orderBy(desc(movements.createdAt)).limit(input?.limit ?? 100).offset(input?.offset ?? 0),
        getDb().select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees).limit(1000),
      ]);
      const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
      return rows.map((r) => ({ ...r, employeeName: names.get(r.employeeId) ?? "Expediente no disponible" }));
    }),
    create: authedQuery.input(z.object({ employeeId: z.number().int().positive(), type: z.string().min(2).max(100), effectiveDate: z.string().min(8), description: z.string().trim().min(3).max(3000) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento"]); const [{ id }] = await getDb().insert(movements).values({ ...input, effectiveDate: new Date(input.effectiveDate), createdBy: ctx.user.id }).returning({ id: movements.id });
      await audit(ctx, "CREAR", "Movimiento", id, input.type); return { id };
    }),
    status: authedQuery.input(statusInput).mutation(async ({ ctx, input }) => {
      await permit(ctx, input.status === "aprobado" ? ["aprobador"] : ["talento"]);
      if (!["aprobado", "rechazado", "anulado", "pendiente"].includes(input.status)) throw new TRPCError({ code: "BAD_REQUEST" });
      const [current] = await getDb().select({ status: movements.status }).from(movements).where(eq(movements.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertTransition(movementTransitions, current.status, input.status);
      const updated = await getDb().update(movements).set({ status: input.status as "aprobado" | "rechazado" | "anulado" | "pendiente" }).where(and(eq(movements.id, input.id), eq(movements.status, current.status))).returning({ id: movements.id });
      if (!updated.length) throw new TRPCError({ code: "CONFLICT", message: "El estado cambió; actualiza e inténtalo de nuevo." });
      await audit(ctx, input.status.toUpperCase(), "Movimiento", input.id, input.reason); return { ok: true };
    }),
  }),

  incidents: createRouter({
    list: authedQuery.input(listInput).query(async ({ ctx, input }) => {
      await permit(ctx, READ_ROLES, "Incidencias");
      const [rows, people] = await Promise.all([
        getDb().select({ id: incidents.id, employeeId: incidents.employeeId, type: incidents.type, startDate: incidents.startDate, endDate: incidents.endDate, quantity: incidents.quantity, unit: incidents.unit, amount: incidents.amount, description: incidents.description, status: incidents.status, createdAt: incidents.createdAt }).from(incidents).orderBy(desc(incidents.createdAt)).limit(input?.limit ?? 100).offset(input?.offset ?? 0),
        getDb().select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees).limit(1000),
      ]);
      const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
      return rows.map((r) => ({ ...r, employeeName: names.get(r.employeeId) ?? "Expediente no disponible" }));
    }),
    create: authedQuery.input(z.object({ employeeId: z.number().int().positive(), type: z.string().min(2).max(100), startDate: z.string().min(8), endDate: z.string().min(8), quantity: z.coerce.number().min(0), unit: z.string().min(1).max(30), amount: z.coerce.number().min(0), description: z.string().max(3000).optional() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["talento", "nomina"]); if (input.endDate < input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha final no puede ser anterior al inicio." });
      const [{ id }] = await getDb().insert(incidents).values({ ...input, startDate: new Date(input.startDate), endDate: new Date(input.endDate), quantity: money(input.quantity), amount: money(input.amount), createdBy: ctx.user.id }).returning({ id: incidents.id });
      await audit(ctx, "CREAR", "Incidencia", id, input.type); return { id };
    }),
    status: authedQuery.input(statusInput).mutation(async ({ ctx, input }) => {
      await permit(ctx, input.status === "aprobada" ? ["aprobador"] : ["talento", "nomina"]);
      if (!["aprobada", "rechazada", "anulada", "pendiente"].includes(input.status)) throw new TRPCError({ code: "BAD_REQUEST" });
      const [current] = await getDb().select({ status: incidents.status }).from(incidents).where(eq(incidents.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertTransition(incidentTransitions, current.status, input.status);
      const updated = await getDb().update(incidents).set({ status: input.status as "aprobada" | "rechazada" | "anulada" | "pendiente" }).where(and(eq(incidents.id, input.id), eq(incidents.status, current.status))).returning({ id: incidents.id });
      if (!updated.length) throw new TRPCError({ code: "CONFLICT", message: "El estado cambió; actualiza e inténtalo de nuevo." });
      await audit(ctx, input.status.toUpperCase(), "Incidencia", input.id, input.reason); return { ok: true };
    }),
  }),

  concepts: createRouter({
    list: authedQuery.query(async ({ ctx }) => { await permit(ctx, READ_ROLES, "Conceptos"); return getDb().select().from(concepts).orderBy(concepts.kind, concepts.code).limit(200); }),
    create: authedQuery.input(z.object({ code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/), name: z.string().trim().min(2), kind: z.enum(["asignacion", "deduccion", "aporte", "informativo"]), calcMethod: z.enum(["fijo", "porcentaje", "por_hijo"]), value: z.coerce.number().min(0), base: z.enum(["normal", "integral"]) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["nomina"]); const [{ id }] = await getDb().insert(concepts).values({ ...input, value: input.value.toFixed(4) }).returning({ id: concepts.id });
      await audit(ctx, "CREAR", "Concepto", id, input.code); return { id };
    }),
    update: authedQuery.input(z.object({ id: z.number().int().positive(), value: z.coerce.number().min(0), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["nomina"]); const [old] = await getDb().select().from(concepts).where(eq(concepts.id, input.id)).limit(1);
      await getDb().update(concepts).set({ value: input.value.toFixed(4), active: input.active, version: (old?.version ?? 0) + 1 }).where(eq(concepts.id, input.id));
      await audit(ctx, "VERSIONAR", "Concepto", input.id, `Versión ${(old?.version ?? 0) + 1}`); return { ok: true };
    }),
    simulate: authedQuery.input(z.object({ calcMethod: z.enum(["fijo", "porcentaje", "por_hijo"]), value: z.coerce.number().min(0), salary: z.coerce.number().min(0), dependents: z.coerce.number().int().min(0).default(0) })).query(async ({ ctx, input }) => {
      await permit(ctx, READ_ROLES, "Simulación");
      const amount = input.calcMethod === "fijo" ? input.value : input.calcMethod === "porcentaje" ? input.salary * input.value / 100 : input.value * input.dependents;
      const explanation = input.calcMethod === "fijo" ? `Monto fijo: ${money(input.value)}` : input.calcMethod === "porcentaje" ? `${money(input.salary)} × ${input.value}%` : `${money(input.value)} × ${input.dependents} derechohabientes`;
      return { amount: money(amount), explanation };
    }),
  }),

  payroll: createRouter({
    list: authedQuery.input(listInput).query(async ({ ctx, input }) => {
      const role = await permit(ctx, [...READ_ROLES, "trabajador"], "Nóminas");
      const db = getDb();
      const summary = { id: payrolls.id, code: payrolls.code, name: payrolls.name, type: payrolls.type, periodStart: payrolls.periodStart, periodEnd: payrolls.periodEnd, status: payrolls.status, totalAssignments: payrolls.totalAssignments, totalDeductions: payrolls.totalDeductions, totalNet: payrolls.totalNet, createdAt: payrolls.createdAt };
      if (role === "trabajador") {
        if (!ctx.user.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "La cuenta no tiene un expediente vinculado." });
        const receipts = await db.select({ payrollId: payrollItems.payrollId, assignments: payrollItems.assignments, deductions: payrollItems.deductions, net: payrollItems.net }).from(payrollItems).where(eq(payrollItems.employeeId, ctx.user.employeeId)).limit(input?.limit ?? 100);
        if (!receipts.length) return [];
        const rows = await db.select(summary).from(payrolls).where(inArray(payrolls.id, receipts.map((r) => r.payrollId))).orderBy(desc(payrolls.createdAt)).limit(input?.limit ?? 100).offset(input?.offset ?? 0);
        return rows.map((payroll) => {
          const receipt = receipts.find((item) => item.payrollId === payroll.id)!;
          return { ...payroll, totalAssignments: receipt.assignments, totalDeductions: receipt.deductions, totalNet: receipt.net };
        });
      }
      const [rows, paymentRows] = await Promise.all([
        db.select(summary).from(payrolls).orderBy(desc(payrolls.createdAt)).limit(input?.limit ?? 100).offset(input?.offset ?? 0),
        db.select({ id: payments.id, payrollId: payments.payrollId, method: payments.method, reference: payments.reference, paidAt: payments.paidAt }).from(payments).limit(200),
      ]);
      return rows.map((p) => ({ ...p, payment: paymentRows.find((x) => x.payrollId === p.id) ?? null }));
    }),
    get: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const role = await permit(ctx, [...READ_ROLES, "trabajador"], "Nómina");
      const db = getDb();
      const [payroll] = await db.select({ id: payrolls.id, code: payrolls.code, name: payrolls.name, periodStart: payrolls.periodStart, periodEnd: payrolls.periodEnd, status: payrolls.status, totalAssignments: payrolls.totalAssignments, totalDeductions: payrolls.totalDeductions, totalNet: payrolls.totalNet, createdBy: payrolls.createdBy }).from(payrolls).where(eq(payrolls.id, input.id)).limit(1);
      if (!payroll) throw new TRPCError({ code: "NOT_FOUND" });
      const condition = role === "trabajador"
        ? and(eq(payrollItems.payrollId, input.id), eq(payrollItems.employeeId, ctx.user.employeeId ?? -1))
        : eq(payrollItems.payrollId, input.id);
      const items = await db.select().from(payrollItems).where(condition).orderBy(payrollItems.employeeName).limit(500);
      if (role === "trabajador" && !items.length) throw new TRPCError({ code: "FORBIDDEN", message: "No puedes consultar esta nómina." });
      const own = role === "trabajador" ? items[0] : undefined;
      return { payroll: own ? { ...payroll, totalAssignments: own.assignments, totalDeductions: own.deductions, totalNet: own.net } : payroll, items };
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
      const updated = await db.update(payrolls).set({ status, approvedBy: input.action === "aprobar" ? ctx.user.id : p.approvedBy, closedAt: input.action === "cerrar" ? new Date() : p.closedAt }).where(and(eq(payrolls.id, input.id), eq(payrolls.status, p.status))).returning({ id: payrolls.id });
      assertUpdated(updated);
      await audit(ctx, input.action.toUpperCase(), "Nómina", input.id, input.reason); return { ok: true };
    }),
    pay: authedQuery.input(z.object({ id: z.number().int().positive(), method: z.enum(["transferencia", "archivo_bancario", "cheque"]), reference: z.string().trim().min(3).max(100), paidAt: z.string().min(8) })).mutation(async ({ ctx, input }) => {
      await permit(ctx, ["tesoreria"]); const db = getDb(); const [p] = await db.select().from(payrolls).where(eq(payrolls.id, input.id)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" }); if (p.status === "pagada") return { ok: true, idempotent: true };
      if (p.status !== "cerrada") throw new TRPCError({ code: "CONFLICT", message: "Solo una nómina cerrada puede registrarse como pagada." });
      const [existing] = await db.select().from(payments).where(eq(payments.payrollId, input.id)).limit(1); if (existing) return { ok: true, idempotent: true };
      try {
        await db.transaction(async (tx) => {
          await tx.insert(payments).values({ payrollId: input.id, method: input.method, reference: input.reference, paidAt: new Date(input.paidAt), registeredBy: ctx.user.id });
          const updated = await tx.update(payrolls).set({ status: "pagada" }).where(and(eq(payrolls.id, input.id), eq(payrolls.status, "cerrada"))).returning({ id: payrolls.id });
          if (!updated.length) throw new TRPCError({ code: "CONFLICT", message: "La nómina cambió de estado; actualiza e inténtalo de nuevo." });
        });
      } catch (error) {
        return idempotentPaymentOnDuplicate(error);
      }
      await audit(ctx, "PAGAR", "Nómina", input.id, `${input.method} · ${input.reference}`); return { ok: true, idempotent: false };
    }),
  }),

  processes: createRouter({
    list: authedQuery.input(listInput).query(async ({ ctx, input }) => {
      await permit(ctx, READ_ROLES, "Procesos");
      const [rows, people] = await Promise.all([
        getDb().select({ id: processes.id, employeeId: processes.employeeId, type: processes.type, startDate: processes.startDate, endDate: processes.endDate, days: processes.days, amount: processes.amount, description: processes.description, status: processes.status, createdAt: processes.createdAt }).from(processes).orderBy(desc(processes.createdAt)).limit(input?.limit ?? 100).offset(input?.offset ?? 0),
        getDb().select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees).limit(1000),
      ]);
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
      const [current] = await getDb().select({ status: processes.status }).from(processes).where(eq(processes.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertTransition(processTransitions, current.status, input.status);
      const updated = await getDb().update(processes).set({ status: input.status as "aprobado" | "rechazado" | "anulado" | "procesado" | "pendiente" }).where(and(eq(processes.id, input.id), eq(processes.status, current.status))).returning({ id: processes.id });
      if (!updated.length) throw new TRPCError({ code: "CONFLICT", message: "El estado cambió; actualiza e inténtalo de nuevo." });
      await audit(ctx, input.status.toUpperCase(), "Proceso especial", input.id, input.reason); return { ok: true };
    }),
  }),

  legal: createRouter({
    list: authedQuery.input(listInput).query(async ({ ctx, input }) => { await permit(ctx, READ_ROLES, "Parámetros legales"); return getDb().select().from(legalParameters).orderBy(desc(legalParameters.effectiveDate)).limit(input?.limit ?? 100).offset(input?.offset ?? 0); }),
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
      await permit(ctx, ["talento"]);
      const bytes = decodeDocumentBase64(input.contentBase64);
      const { contentType } = validateDocument(input.name, input.contentType, bytes);
      await assertEmployeeExists(input.employeeId);
      const saved = await storage.uploadFile({ fileContent: bytes, fileName: `rrhh/${ctx.user.id}/${input.employeeId}/${input.name}`, contentType });
      let id: number;
      try {
        [{ id }] = await getDb().insert(documents).values({ employeeId: input.employeeId, ownerId: ctx.user.id, key: saved.key, name: input.name, category: input.category, size: saved.size, contentType }).returning({ id: documents.id });
      } catch (error) {
        try { await storage.deleteFile(saved.key); } catch { console.error("No se pudo eliminar un documento huérfano tras fallar su registro."); }
        throw error;
      }
      await audit(ctx, "ADJUNTAR", "Documento", id, input.name); return { id };
    }),
    url: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const role = await permit(ctx, [...READ_ROLES, "trabajador"], "Documento");
      const [doc] = await getDb().select({ id: documents.id, employeeId: documents.employeeId, key: documents.key, name: documents.name }).from(documents).where(eq(documents.id, input.id)).limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      await assertEmployeeAccess(ctx, role, doc.employeeId);
      const result = await storage.getPresignedUrl({ key: doc.key, download: true });
      await audit(ctx, "DESCARGAR", "Documento", doc.id, doc.name);
      return result;
    }),
  }),

  users: createRouter({
    list: authedQuery.query(async ({ ctx }) => {
      await requireGlobalAdmin(ctx);
      const [userRows, profiles] = await Promise.all([
        getDb().select().from(users).orderBy(users.name).limit(500),
        getDb().select({ userId: accessProfiles.userId, rrhhRole: accessProfiles.rrhhRole, active: accessProfiles.active }).from(accessProfiles).limit(500),
      ]);
      return userRows.map((u) => ({ ...publicUser(u), profile: profiles.find((p) => p.userId === u.id) ?? null }));
    }),
    create: authedQuery.input(z.object({
      username: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9._-]+$/),
      name: z.string().trim().min(2).max(255), email: z.union([z.literal(""), z.string().email().max(320)]).default(""),
      password: passwordPolicy, globalAdmin: z.boolean().default(false),
      rrhhRole: z.enum(["administrador", "talento", "nomina", "aprobador", "tesoreria", "consulta", "trabajador"]).default("consulta"),
      employeeId: z.number().int().positive().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      await requireGlobalAdmin(ctx);
      if (input.rrhhRole === "trabajador" && !input.employeeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Vincula un expediente al trabajador." });
      if (input.employeeId) await assertEmployeeExists(input.employeeId);
      const db = getDb();
      try {
        const id = await db.transaction(async (tx) => {
          const [created] = await tx.insert(users).values({ unionId: `local:${input.username}`, username: input.username, name: input.name, email: input.email || null, passwordHash: await hashPassword(input.password), role: input.globalAdmin ? "admin" : "user", employeeId: input.rrhhRole === "trabajador" ? input.employeeId : null }).returning({ id: users.id });
          await tx.insert(accessProfiles).values({ userId: created.id, rrhhRole: input.rrhhRole });
          return created.id;
        });
        await audit(ctx, "CREAR", "Usuario", id); return { id };
      } catch (error) {
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "El nombre de usuario ya está registrado." });
        throw error;
      }
    }),
    setRole: authedQuery.input(z.object({ userId: z.number().int().positive(), rrhhRole: z.enum(["administrador", "talento", "nomina", "aprobador", "tesoreria", "consulta", "trabajador"]), employeeId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
      await requireGlobalAdmin(ctx);
      if (input.rrhhRole === "trabajador" && !input.employeeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Vincula un expediente al trabajador." });
      if (input.employeeId) await assertEmployeeExists(input.employeeId);
      const db = getDb();
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
      await db.transaction(async (tx) => {
        await tx.insert(accessProfiles).values({ userId: input.userId, rrhhRole: input.rrhhRole }).onConflictDoUpdate({ target: accessProfiles.userId, set: { rrhhRole: input.rrhhRole } });
        await tx.update(users).set({ employeeId: input.rrhhRole === "trabajador" ? input.employeeId! : null, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, input.userId));
        await tx.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.userId, input.userId));
      });
      await audit(ctx, "ASIGNAR_PERFIL", "Usuario", input.userId, input.rrhhRole); return { ok: true };
    }),
    setActive: authedQuery.input(z.object({ userId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireGlobalAdmin(ctx);
      const db = getDb();
      await db.transaction(async (tx) => {
        const admins = await tx.select({ id: users.id, disabledAt: users.disabledAt }).from(users).where(eq(users.role, "admin")).for("update");
        const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update").limit(1);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
        if (!input.active) assertNotLastAdmin(target, admins);
        await tx.update(users).set({ disabledAt: input.active ? null : new Date(), sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, input.userId));
        await tx.insert(accessProfiles).values({ userId: input.userId, active: input.active }).onConflictDoUpdate({ target: accessProfiles.userId, set: { active: input.active } });
        await tx.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.userId, input.userId));
      });
      await audit(ctx, input.active ? "ACTIVAR" : "DESACTIVAR", "Usuario", input.userId); return { ok: true };
    }),
    changePassword: authedQuery.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordPolicy })).mutation(async ({ ctx, input }) => {
      if (!ctx.user.passwordHash || !(await verifyPassword(input.currentPassword, ctx.user.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "La contraseña actual no es correcta." });
      const db = getDb();
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash: await hashPassword(input.newPassword), sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, ctx.user.id));
        await tx.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.userId, ctx.user.id));
      });
      await audit(ctx, "CAMBIAR_CONTRASEÑA", "Usuario", ctx.user.id);
      ctx.resHeaders.append("set-cookie", cookie.serialize(SESSION_COOKIE, "", sessionCookieOptions(0)));
      return { ok: true };
    }),
    resetPassword: authedQuery.input(z.object({ userId: z.number().int().positive(), newPassword: passwordPolicy })).mutation(async ({ ctx, input }) => {
      await requireGlobalAdmin(ctx);
      const db = getDb();
      const updated = await db.transaction(async (tx) => {
        const rows = await tx.update(users).set({ passwordHash: await hashPassword(input.newPassword), sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, input.userId)).returning({ id: users.id });
        if (rows.length) await tx.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.userId, input.userId));
        return rows;
      });
      if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
      if (input.userId === ctx.user.id) ctx.resHeaders.append("set-cookie", cookie.serialize(SESSION_COOKIE, "", sessionCookieOptions(0)));
      await audit(ctx, "RESTABLECER_CONTRASEÑA", "Usuario", input.userId); return { ok: true };
    }),
  }),

  audit: createRouter({
    list: authedQuery.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
      await permit(ctx, ["consulta", "talento", "nomina"]);
      return getDb().select({ id: auditLogs.id, userName: auditLogs.userName, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, detail: auditLogs.detail, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(input?.limit ?? 100);
    }),
  }),
});
