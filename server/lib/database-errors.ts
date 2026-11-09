export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function idempotentPaymentOnDuplicate(error: unknown) {
  if (isUniqueViolation(error)) return { ok: true, idempotent: true } as const;
  throw error;
}
