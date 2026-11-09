CREATE TABLE "rrhh_auth_sessions" (
	"idHash" varchar(64) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"sessionVersion" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rrhh_login_attempts" (
	"keyHash" varchar(64) PRIMARY KEY NOT NULL,
	"scope" varchar(20) NOT NULL,
	"windowStartedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"blockedUntil" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rrhh_audit_logs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabledAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sessionVersion" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employeeId" integer;--> statement-breakpoint
ALTER TABLE "rrhh_auth_sessions" ADD CONSTRAINT "rrhh_auth_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rrhh_auth_sessions_user_idx" ON "rrhh_auth_sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "rrhh_auth_sessions_expiry_idx" ON "rrhh_auth_sessions" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "rrhh_login_attempts_retention_idx" ON "rrhh_login_attempts" USING btree ("updatedAt");--> statement-breakpoint
UPDATE "users" SET "disabledAt" = NOW()
WHERE EXISTS (
  SELECT 1 FROM "rrhh_access_profiles"
  WHERE "rrhh_access_profiles"."userId" = "users"."id"
    AND "rrhh_access_profiles"."active" = false
);