import "dotenv/config";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { accessProfiles, auditLogs, users } from "./schema.js";
import { hashPassword, passwordPolicy } from "../server/local-auth.js";
import { getDb, closeDb } from "../server/queries/connection.js";

let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function askPassword(prompt: string) {
  hidden = true;
  const value = await rl.question(prompt);
  hidden = false;
  process.stdout.write("\n");
  return value;
}

async function createAdmin() {
  if (!process.stdin.isTTY) throw new Error("Ejecuta este comando en una terminal interactiva.");
  const username = (await rl.question("Usuario del administrador: ")).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,80}$/.test(username) || username.endsWith(".demo")) throw new Error("Usuario no válido o reservado para demo.");
  const name = (await rl.question("Nombre: ")).trim();
  const email = (await rl.question("Correo (opcional): ")).trim();
  const password = passwordPolicy.parse(await askPassword("Contraseña (no se mostrará): "));
  if (password !== await askPassword("Repite la contraseña: ")) throw new Error("Las contraseñas no coinciden.");

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing) throw new Error("El nombre de usuario ya existe.");
  await db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values({ unionId: `local:${username}`, username, name, email: email || null, passwordHash: await hashPassword(password), role: "admin" }).returning({ id: users.id });
    await tx.insert(accessProfiles).values({ userId: created.id, rrhhRole: "administrador" });
    await tx.insert(auditLogs).values({ userId: created.id, userName: name, action: "CREAR", entity: "Usuario", entityId: String(created.id), detail: "Alta mediante CLI" });
  });
  console.log(`Administrador global creado: ${username}`);
}

createAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : "No se pudo crear el administrador.");
  process.exitCode = 1;
}).finally(async () => {
  rl.close();
  await closeDb();
});
