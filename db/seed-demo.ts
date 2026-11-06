import { eq } from "drizzle-orm";
import { getDb } from "../server/queries/connection";
import { accessProfiles, users } from "./schema";
import { hashPassword } from "../server/local-auth";

const DEMO_PASSWORD = "DemoRRHH2026!";
const demoUsers = [
  { username: "admin.demo", name: "Administrador demo", role: "admin" as const, rrhhRole: "administrador" as const },
  { username: "talento.demo", name: "Talento Humano demo", role: "user" as const, rrhhRole: "talento" as const },
  { username: "nomina.demo", name: "Nómina demo", role: "user" as const, rrhhRole: "nomina" as const },
  { username: "aprobador.demo", name: "Aprobador demo", role: "user" as const, rrhhRole: "aprobador" as const },
  { username: "tesoreria.demo", name: "Tesorería demo", role: "user" as const, rrhhRole: "tesoreria" as const },
  { username: "consulta.demo", name: "Consulta demo", role: "user" as const, rrhhRole: "consulta" as const },
];

async function seedDemoUsers() {
  const db = getDb();
  for (const demo of demoUsers) {
    const unionId = `demo:${demo.username}`;
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const [existingUser] = await db.select().from(users).where(eq(users.unionId, unionId)).limit(1);
    if (existingUser) {
      await db.update(users).set({ username: demo.username, name: demo.name, role: demo.role, passwordHash }).where(eq(users.id, existingUser.id));
    } else {
      await db.insert(users).values({ unionId, username: demo.username, name: demo.name, role: demo.role, passwordHash });
    }
    const [user] = await db.select().from(users).where(eq(users.unionId, unionId)).limit(1);
    if (!user) throw new Error(`No se pudo crear ${demo.username}`);
    const [existingProfile] = await db.select().from(accessProfiles).where(eq(accessProfiles.userId, user.id)).limit(1);
    if (existingProfile) {
      await db.update(accessProfiles).set({ rrhhRole: demo.rrhhRole, active: true }).where(eq(accessProfiles.id, existingProfile.id));
    } else {
      await db.insert(accessProfiles).values({ userId: user.id, rrhhRole: demo.rrhhRole, active: true });
    }
  }
  console.log("Usuarios demo creados: 6. Contraseña compartida: DemoRRHH2026!");
  process.exit(0);
}

seedDemoUsers().catch((error) => {
  console.error(error);
  process.exit(1);
});
