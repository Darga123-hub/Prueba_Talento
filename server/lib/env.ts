function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get sessionSecret() {
    const value = required("SESSION_SECRET");
    if (value.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
    return value;
  },
  get blobToken() { return required("BLOB_READ_WRITE_TOKEN"); },
  isProduction: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
};
