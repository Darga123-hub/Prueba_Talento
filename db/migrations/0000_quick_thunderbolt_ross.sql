CREATE TYPE "public"."calculation_method" AS ENUM('fijo', 'porcentaje', 'por_hijo');--> statement-breakpoint
CREATE TYPE "public"."concept_kind" AS ENUM('asignacion', 'deduccion', 'aporte', 'informativo');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('activo', 'suspendido', 'vacaciones', 'egresado');--> statement-breakpoint
CREATE TYPE "public"."rrhh_role" AS ENUM('administrador', 'talento', 'nomina', 'aprobador', 'tesoreria', 'consulta', 'trabajador');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('pendiente', 'aprobada', 'rechazada', 'anulada');--> statement-breakpoint
CREATE TYPE "public"."movement_status" AS ENUM('borrador', 'pendiente', 'aprobado', 'rechazado', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('transferencia', 'archivo_bancario', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('borrador', 'revision', 'aprobada', 'cerrada', 'pagada', 'anulada', 'reabierta');--> statement-breakpoint
CREATE TYPE "public"."payroll_type" AS ENUM('ordinaria', 'especial', 'vacaciones', 'fin_ano', 'prestaciones', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."personnel_type" AS ENUM('carrera', 'libre', 'alto_nivel', 'contratado', 'obrero', 'comisionado', 'jubilado', 'pensionado');--> statement-breakpoint
CREATE TYPE "public"."process_status" AS ENUM('borrador', 'pendiente', 'aprobado', 'rechazado', 'anulado', 'procesado');--> statement-breakpoint
CREATE TYPE "public"."process_type" AS ENUM('vacaciones', 'vacaciones_colectivas', 'fin_ano', 'prestaciones', 'anticipo', 'liquidacion', 'jubilacion', 'pension', 'aumento', 'retroactivo');--> statement-breakpoint
CREATE TYPE "public"."salary_base" AS ENUM('normal', 'integral');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('pendiente', 'verificado', 'inactivo');--> statement-breakpoint
CREATE TABLE "rrhh_access_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"rrhhRole" "rrhh_role" DEFAULT 'consulta' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rrhh_access_profiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "rrhh_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"userName" varchar(255),
	"action" varchar(100) NOT NULL,
	"entity" varchar(80) NOT NULL,
	"entityId" varchar(50),
	"detail" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rrhh_catalog_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rrhh_concepts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(140) NOT NULL,
	"kind" "concept_kind" NOT NULL,
	"calcMethod" "calculation_method" NOT NULL,
	"value" numeric(14, 4) DEFAULT '0' NOT NULL,
	"base" "salary_base" DEFAULT 'normal' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rrhh_concepts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rrhh_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"key" varchar(600) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) DEFAULT 'Expediente' NOT NULL,
	"size" integer NOT NULL,
	"contentType" varchar(160),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rrhh_documents_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "rrhh_employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"documentId" varchar(24) NOT NULL,
	"firstName" varchar(100) NOT NULL,
	"lastName" varchar(100) NOT NULL,
	"email" varchar(320),
	"phone" varchar(40),
	"birthDate" timestamp with time zone,
	"hireDate" timestamp with time zone NOT NULL,
	"department" varchar(140) NOT NULL,
	"position" varchar(140) NOT NULL,
	"personnelType" "personnel_type" NOT NULL,
	"regime" varchar(100) DEFAULT 'General' NOT NULL,
	"status" "employee_status" DEFAULT 'activo' NOT NULL,
	"baseSalary" numeric(14, 2) DEFAULT '0' NOT NULL,
	"integralSalary" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bankName" varchar(120),
	"bankAccountLast4" varchar(4),
	"dependents" integer DEFAULT 0 NOT NULL,
	"address" text,
	"education" varchar(180),
	"notes" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rrhh_employees_documentId_unique" UNIQUE("documentId")
);
--> statement-breakpoint
CREATE TABLE "rrhh_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"type" varchar(100) NOT NULL,
	"startDate" timestamp with time zone NOT NULL,
	"endDate" timestamp with time zone NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '0' NOT NULL,
	"unit" varchar(30) DEFAULT 'días' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"status" "incident_status" DEFAULT 'pendiente' NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rrhh_legal_parameters" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"value" numeric(14, 4) DEFAULT '0' NOT NULL,
	"unit" varchar(60) NOT NULL,
	"regime" varchar(100) DEFAULT 'General' NOT NULL,
	"effectiveDate" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"article" varchar(100),
	"validationStatus" "validation_status" DEFAULT 'pendiente' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rrhh_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"type" varchar(100) NOT NULL,
	"effectiveDate" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"status" "movement_status" DEFAULT 'pendiente' NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rrhh_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"payrollId" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" varchar(100) NOT NULL,
	"paidAt" timestamp with time zone NOT NULL,
	"registeredBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rrhh_payments_payrollId_unique" UNIQUE("payrollId")
);
--> statement-breakpoint
CREATE TABLE "rrhh_payroll_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"payrollId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"employeeName" varchar(220) NOT NULL,
	"documentId" varchar(24) NOT NULL,
	"baseSalary" numeric(14, 2) NOT NULL,
	"assignments" numeric(14, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"details" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rrhh_payrolls" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" "payroll_type" DEFAULT 'ordinaria' NOT NULL,
	"periodStart" timestamp with time zone NOT NULL,
	"periodEnd" timestamp with time zone NOT NULL,
	"status" "payroll_status" DEFAULT 'borrador' NOT NULL,
	"totalAssignments" numeric(16, 2) DEFAULT '0' NOT NULL,
	"totalDeductions" numeric(16, 2) DEFAULT '0' NOT NULL,
	"totalNet" numeric(16, 2) DEFAULT '0' NOT NULL,
	"createdBy" integer NOT NULL,
	"approvedBy" integer,
	"closedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rrhh_payrolls_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rrhh_processes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"type" "process_type" NOT NULL,
	"startDate" timestamp with time zone NOT NULL,
	"endDate" timestamp with time zone,
	"days" numeric(8, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"calculation" jsonb,
	"status" "process_status" DEFAULT 'pendiente' NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"unionId" varchar(255) NOT NULL,
	"name" varchar(255),
	"email" varchar(320),
	"avatar" text,
	"username" varchar(80),
	"passwordHash" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignInAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_unionId_unique" UNIQUE("unionId"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "rrhh_access_profiles" ADD CONSTRAINT "rrhh_access_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_audit_logs" ADD CONSTRAINT "rrhh_audit_logs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_documents" ADD CONSTRAINT "rrhh_documents_employeeId_rrhh_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."rrhh_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_documents" ADD CONSTRAINT "rrhh_documents_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_employees" ADD CONSTRAINT "rrhh_employees_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_incidents" ADD CONSTRAINT "rrhh_incidents_employeeId_rrhh_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."rrhh_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_incidents" ADD CONSTRAINT "rrhh_incidents_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_movements" ADD CONSTRAINT "rrhh_movements_employeeId_rrhh_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."rrhh_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_movements" ADD CONSTRAINT "rrhh_movements_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_payments" ADD CONSTRAINT "rrhh_payments_payrollId_rrhh_payrolls_id_fk" FOREIGN KEY ("payrollId") REFERENCES "public"."rrhh_payrolls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_payments" ADD CONSTRAINT "rrhh_payments_registeredBy_users_id_fk" FOREIGN KEY ("registeredBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_payroll_items" ADD CONSTRAINT "rrhh_payroll_items_payrollId_rrhh_payrolls_id_fk" FOREIGN KEY ("payrollId") REFERENCES "public"."rrhh_payrolls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_payroll_items" ADD CONSTRAINT "rrhh_payroll_items_employeeId_rrhh_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."rrhh_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_payrolls" ADD CONSTRAINT "rrhh_payrolls_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_payrolls" ADD CONSTRAINT "rrhh_payrolls_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_processes" ADD CONSTRAINT "rrhh_processes_employeeId_rrhh_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."rrhh_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rrhh_processes" ADD CONSTRAINT "rrhh_processes_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rrhh_audit_created_idx" ON "rrhh_audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "rrhh_catalog_unique" ON "rrhh_catalog_items" USING btree ("category","name");--> statement-breakpoint
CREATE INDEX "rrhh_employees_name_idx" ON "rrhh_employees" USING btree ("lastName","firstName");--> statement-breakpoint
CREATE INDEX "rrhh_employees_status_idx" ON "rrhh_employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rrhh_incidents_employee_idx" ON "rrhh_incidents" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "rrhh_movements_employee_idx" ON "rrhh_movements" USING btree ("employeeId");--> statement-breakpoint
CREATE UNIQUE INDEX "rrhh_payroll_employee_unique" ON "rrhh_payroll_items" USING btree ("payrollId","employeeId");--> statement-breakpoint
CREATE INDEX "rrhh_payroll_items_employee_idx" ON "rrhh_payroll_items" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "rrhh_processes_employee_idx" ON "rrhh_processes" USING btree ("employeeId");