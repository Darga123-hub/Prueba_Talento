import { getDb } from "../server/queries/connection";
import { catalogItems, concepts } from "./schema";

async function seed() {
  const db = getDb();
  const catalogs = [
    ["departamento", "Dirección General"], ["departamento", "Talento Humano"], ["departamento", "Administración"], ["departamento", "Tesorería"], ["departamento", "Planificación"],
    ["cargo", "Analista"], ["cargo", "Coordinador"], ["cargo", "Asistente administrativo"], ["cargo", "Obrero calificado"],
    ["movimiento", "Cambio de cargo"], ["movimiento", "Cambio de dependencia"], ["movimiento", "Aumento de sueldo"], ["movimiento", "Suspensión"], ["movimiento", "Reincorporación"], ["movimiento", "Egreso"],
    ["incidencia", "Horas extra"], ["incidencia", "Feriado trabajado"], ["incidencia", "Inasistencia"], ["incidencia", "Permiso remunerado"], ["incidencia", "Permiso no remunerado"], ["incidencia", "Reposo"], ["incidencia", "Comisión de servicio"],
    ["documento", "Documento de identidad"], ["documento", "Currículum"], ["documento", "Título o certificación"], ["documento", "Documento de derechohabiente"], ["documento", "Nombramiento"], ["documento", "Otro soporte"],
  ] as const;
  for (const [category, name] of catalogs) {
    await db.insert(catalogItems).values({ category, name }).onConflictDoUpdate({ target: [catalogItems.category, catalogItems.name], set: { name } });
  }
  const initialConcepts = [
    { code: "BONO_FIJO", name: "Bono fijo configurable", kind: "asignacion" as const, calcMethod: "fijo" as const, value: "0", base: "normal" as const, active: false },
    { code: "DED_FIJA", name: "Deducción fija configurable", kind: "deduccion" as const, calcMethod: "fijo" as const, value: "0", base: "normal" as const, active: false },
  ];
  for (const concept of initialConcepts) {
    await db.insert(concepts).values(concept).onConflictDoUpdate({ target: concepts.code, set: { name: concept.name } });
  }
  console.log(`Catálogos iniciales: ${catalogs.length}. Conceptos configurables: ${initialConcepts.length}.`);
  process.exit(0);
}
seed().catch((error) => { console.error(error); process.exit(1); });
