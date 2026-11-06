import {
  pgTable, pgEnum, serial, varchar, text, timestamp, integer,
  numeric, boolean, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const hrRole = pgEnum("rrhh_role", ["administrador", "talento", "nomina", "aprobador", "tesoreria", "consulta", "trabajador"]);
export const personnelType = pgEnum("personnel_type", ["carrera", "libre", "alto_nivel", "contratado", "obrero", "comisionado", "jubilado", "pensionado"]);
export const employeeStatus = pgEnum("employee_status", ["activo", "suspendido", "vacaciones", "egresado"]);
export const movementStatus = pgEnum("movement_status", ["borrador", "pendiente", "aprobado", "rechazado", "anulado"]);
export const incidentStatus = pgEnum("incident_status", ["pendiente", "aprobada", "rechazada", "anulada"]);
export const conceptKind = pgEnum("concept_kind", ["asignacion", "deduccion", "aporte", "informativo"]);
export const calculationMethod = pgEnum("calculation_method", ["fijo", "porcentaje", "por_hijo"]);
export const salaryBase = pgEnum("salary_base", ["normal", "integral"]);
export const payrollType = pgEnum("payroll_type", ["ordinaria", "especial", "vacaciones", "fin_ano", "prestaciones", "ajuste"]);
export const payrollStatus = pgEnum("payroll_status", ["borrador", "revision", "aprobada", "cerrada", "pagada", "anulada", "reabierta"]);
export const paymentMethod = pgEnum("payment_method", ["transferencia", "archivo_bancario", "cheque"]);
export const processType = pgEnum("process_type", ["vacaciones", "vacaciones_colectivas", "fin_ano", "prestaciones", "anticipo", "liquidacion", "jubilacion", "pension", "aumento", "retroactivo"]);
export const processStatus = pgEnum("process_status", ["borrador", "pendiente", "aprobado", "rechazado", "anulado", "procesado"]);
export const validationStatus = pgEnum("validation_status", ["pendiente", "verificado", "inactivo"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  username: varchar("username", { length: 80 }).unique(),
  passwordHash: text("passwordHash"),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt", { withTimezone: true }).defaultNow().notNull(),
});

export const accessProfiles = pgTable("rrhh_access_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique().references(() => users.id),
  rrhhRole: hrRole("rrhhRole").default("consulta").notNull(),
  active: boolean("active").default(true).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const employees = pgTable("rrhh_employees", {
  id: serial("id").primaryKey(),
  documentId: varchar("documentId", { length: 24 }).notNull().unique(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  birthDate: timestamp("birthDate", { withTimezone: true }),
  hireDate: timestamp("hireDate", { withTimezone: true }).notNull(),
  department: varchar("department", { length: 140 }).notNull(),
  position: varchar("position", { length: 140 }).notNull(),
  personnelType: personnelType("personnelType").notNull(),
  regime: varchar("regime", { length: 100 }).default("General").notNull(),
  status: employeeStatus("status").default("activo").notNull(),
  baseSalary: numeric("baseSalary", { precision: 14, scale: 2 }).default("0").notNull(),
  integralSalary: numeric("integralSalary", { precision: 14, scale: 2 }).default("0").notNull(),
  bankName: varchar("bankName", { length: 120 }),
  bankAccountLast4: varchar("bankAccountLast4", { length: 4 }),
  dependents: integer("dependents").default(0).notNull(),
  address: text("address"),
  education: varchar("education", { length: 180 }),
  notes: text("notes"),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [index("rrhh_employees_name_idx").on(t.lastName, t.firstName), index("rrhh_employees_status_idx").on(t.status)]);

export const catalogItems = pgTable("rrhh_catalog_items", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 60 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("rrhh_catalog_unique").on(t.category, t.name)]);

export const movements = pgTable("rrhh_movements", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  type: varchar("type", { length: 100 }).notNull(),
  effectiveDate: timestamp("effectiveDate", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  status: movementStatus("status").default("pendiente").notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("rrhh_movements_employee_idx").on(t.employeeId)]);

export const incidents = pgTable("rrhh_incidents", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  type: varchar("type", { length: 100 }).notNull(),
  startDate: timestamp("startDate", { withTimezone: true }).notNull(),
  endDate: timestamp("endDate", { withTimezone: true }).notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).default("0").notNull(),
  unit: varchar("unit", { length: 30 }).default("días").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).default("0").notNull(),
  description: text("description"),
  status: incidentStatus("status").default("pendiente").notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("rrhh_incidents_employee_idx").on(t.employeeId)]);

export const concepts = pgTable("rrhh_concepts", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 140 }).notNull(),
  kind: conceptKind("kind").notNull(),
  calcMethod: calculationMethod("calcMethod").notNull(),
  value: numeric("value", { precision: 14, scale: 4 }).default("0").notNull(),
  base: salaryBase("base").default("normal").notNull(),
  version: integer("version").default(1).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const payrolls = pgTable("rrhh_payrolls", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  type: payrollType("type").default("ordinaria").notNull(),
  periodStart: timestamp("periodStart", { withTimezone: true }).notNull(),
  periodEnd: timestamp("periodEnd", { withTimezone: true }).notNull(),
  status: payrollStatus("status").default("borrador").notNull(),
  totalAssignments: numeric("totalAssignments", { precision: 16, scale: 2 }).default("0").notNull(),
  totalDeductions: numeric("totalDeductions", { precision: 16, scale: 2 }).default("0").notNull(),
  totalNet: numeric("totalNet", { precision: 16, scale: 2 }).default("0").notNull(),
  createdBy: integer("createdBy").notNull().references(() => users.id),
  approvedBy: integer("approvedBy").references(() => users.id),
  closedAt: timestamp("closedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const payrollItems = pgTable("rrhh_payroll_items", {
  id: serial("id").primaryKey(),
  payrollId: integer("payrollId").notNull().references(() => payrolls.id),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  employeeName: varchar("employeeName", { length: 220 }).notNull(),
  documentId: varchar("documentId", { length: 24 }).notNull(),
  baseSalary: numeric("baseSalary", { precision: 14, scale: 2 }).notNull(),
  assignments: numeric("assignments", { precision: 14, scale: 2 }).default("0").notNull(),
  deductions: numeric("deductions", { precision: 14, scale: 2 }).default("0").notNull(),
  net: numeric("net", { precision: 14, scale: 2 }).notNull(),
  details: jsonb("details").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("rrhh_payroll_employee_unique").on(t.payrollId, t.employeeId), index("rrhh_payroll_items_employee_idx").on(t.employeeId)]);

export const payments = pgTable("rrhh_payments", {
  id: serial("id").primaryKey(),
  payrollId: integer("payrollId").notNull().unique().references(() => payrolls.id),
  method: paymentMethod("method").notNull(),
  reference: varchar("reference", { length: 100 }).notNull(),
  paidAt: timestamp("paidAt", { withTimezone: true }).notNull(),
  registeredBy: integer("registeredBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const processes = pgTable("rrhh_processes", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  type: processType("type").notNull(),
  startDate: timestamp("startDate", { withTimezone: true }).notNull(),
  endDate: timestamp("endDate", { withTimezone: true }),
  days: numeric("days", { precision: 8, scale: 2 }).default("0").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).default("0").notNull(),
  description: text("description"),
  calculation: jsonb("calculation"),
  status: processStatus("status").default("pendiente").notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("rrhh_processes_employee_idx").on(t.employeeId)]);

export const legalParameters = pgTable("rrhh_legal_parameters", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  value: numeric("value", { precision: 14, scale: 4 }).default("0").notNull(),
  unit: varchar("unit", { length: 60 }).notNull(),
  regime: varchar("regime", { length: 100 }).default("General").notNull(),
  effectiveDate: timestamp("effectiveDate", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  article: varchar("article", { length: 100 }),
  validationStatus: validationStatus("validationStatus").default("pendiente").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable("rrhh_documents", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  ownerId: integer("ownerId").notNull().references(() => users.id),
  key: varchar("key", { length: 600 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).default("Expediente").notNull(),
  size: integer("size").notNull(),
  contentType: varchar("contentType", { length: 160 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("rrhh_audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 50 }),
  detail: text("detail"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("rrhh_audit_created_idx").on(t.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type Payroll = typeof payrolls.$inferSelect;
export type PayrollItem = typeof payrollItems.$inferSelect;
