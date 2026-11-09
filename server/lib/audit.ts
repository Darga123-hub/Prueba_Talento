import { auditLogs, type User } from "../../db/schema.js";
import { getDb } from "../queries/connection.js";

type AuditInput = {
  user?: Pick<User, "id" | "name"> | null;
  action: string;
  entity: string;
  entityId?: string | number;
  detail?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function writeAudit({ user, action, entity, entityId, detail, metadata }: AuditInput) {
  await getDb().insert(auditLogs).values({
    userId: user?.id,
    userName: user?.name,
    action,
    entity,
    entityId: entityId?.toString(),
    detail,
    metadata,
  });
}
