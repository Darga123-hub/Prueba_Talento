import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/router.js";
import { createRouter, publicQuery } from "../server/middleware.js";
import { assertGlobalAdmin } from "../server/authorization.js";
import { publicUser } from "../server/lib/public-user.js";
import { demoLoginAllowed, assertNotLastAdmin, accountSessionAllowed, isOwnEmployee } from "../server/lib/user-security.js";
import { assertLoginRowsAllowed, loginBlockMinutes, loginKeys, LOGIN_LIMITS } from "../server/login-rate-limit.js";
import { isSessionValid, type SessionClaims, type StoredSession } from "../server/session.js";
import { validateDocument } from "../server/lib/file-validation.js";
import { buildCsv, csvCell } from "../frontend/src/shared/csv.js";
import type { User } from "../db/schema.js";

process.env.SESSION_SECRET = "test-only-secret-with-at-least-32-characters";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1, unionId: "local:test", name: "Prueba", email: null, avatar: null,
    username: "test", passwordHash: "private-hash", role: "user", disabledAt: null,
    sessionVersion: 1, employeeId: 10, createdAt: new Date(), updatedAt: new Date(), lastSignInAt: new Date(),
    ...overrides,
  };
}
function hasCode(code: string) {
  return (error: unknown) => { assert.equal((error as TRPCError).code, code); return true; };
}

test("una cuenta desactivada recibe 401 en lecturas y escrituras", async () => {
  assert.equal(accountSessionAllowed(makeUser({ disabledAt: new Date() }), 1), false);
  assert.equal(accountSessionAllowed(makeUser({ sessionVersion: 2 }), 1), false);
  const caller = appRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: null, sessionHash: null });
  await assert.rejects(caller.hr.employees.list(), hasCode("UNAUTHORIZED"));
  await assert.rejects(caller.hr.users.changePassword({ currentPassword: "old", newPassword: "NewPassword123!" }), hasCode("UNAUTHORIZED"));
});

test("un trabajador no puede consultar otro expediente ni uno sin vincular", () => {
  assert.equal(isOwnEmployee(makeUser({ employeeId: 10 }), 11), false);
  assert.equal(isOwnEmployee(makeUser({ employeeId: null }), 10), false);
  assert.equal(isOwnEmployee(makeUser({ employeeId: 10 }), 10), true);
});

test("la misma regla impide descargar documentos ajenos", () => {
  assert.equal(isOwnEmployee(makeUser({ employeeId: 10 }), 99), false);
});

test("un administrador RRHH no puede crear administradores globales", () => {
  assert.throws(() => assertGlobalAdmin(makeUser({ role: "user" })), hasCode("FORBIDDEN"));
  assert.doesNotThrow(() => assertGlobalAdmin(makeUser({ role: "admin" })));
});

test("no se puede desactivar al último administrador global", () => {
  assert.throws(() => assertNotLastAdmin(makeUser({ role: "admin" }), [makeUser({ role: "admin" })]), hasCode("CONFLICT"));
  assert.doesNotThrow(() => assertNotLastAdmin(makeUser({ role: "admin" }), [makeUser(), makeUser()]));
  assert.doesNotThrow(() => assertNotLastAdmin(makeUser({ role: "user" }), [makeUser({ role: "admin" })]));
});

test("publicUser usado por hr.session y users.list excluye campos internos", () => {
  const result = publicUser(makeUser()) as Record<string, unknown>;
  assert.equal("passwordHash" in result, false);
  assert.equal("sessionVersion" in result, false);
  assert.equal("unionId" in result, false);
});

test("el login demo se rechaza cuando el modo demo está desactivado", () => {
  const demo = makeUser({ unionId: "demo:admin.demo", username: "admin.demo" });
  assert.equal(demoLoginAllowed(demo, false), false);
  assert.equal(demoLoginAllowed(demo, true), true);
  assert.equal(demoLoginAllowed(makeUser(), false), true);
});

test("el rate limit devuelve 429 y no se evade cambiando el username", () => {
  const req = new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.10" } });
  const first = loginKeys(req, "first");
  const second = loginKeys(req, "second");
  assert.equal(first.ip, second.ip);
  assert.notEqual(first.account, second.account);
  assert.equal(loginBlockMinutes("account", LOGIN_LIMITS.account - 1), 0);
  assert.ok(loginBlockMinutes("account", LOGIN_LIMITS.account) > 0);
  assert.ok(loginBlockMinutes("account", LOGIN_LIMITS.account + 1) > loginBlockMinutes("account", LOGIN_LIMITS.account));
  assert.throws(() => assertLoginRowsAllowed([{ blockedUntil: new Date(Date.now() + 60_000) }]), hasCode("TOO_MANY_REQUESTS"));
});

test("logout y cambio de contraseña invalidan la sesión anterior", () => {
  const claims: SessionClaims = { unionId: "local:test", sid: "session", sessionVersion: 1 };
  const stored: StoredSession = { sessionVersion: 1, expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date(), revokedAt: null };
  assert.equal(isSessionValid(stored, claims), true);
  assert.equal(isSessionValid({ ...stored, revokedAt: new Date() }, claims), false);
  assert.equal(isSessionValid({ ...stored, sessionVersion: 2 }, claims), false);
  assert.equal(isSessionValid({ ...stored, lastSeenAt: new Date(Date.now() - 2 * 60 * 60_000) }, claims), false);
});

test("un PDF falso y un ejecutable renombrado son rechazados", () => {
  const validPdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\nendobj\n%%EOF");
  assert.doesNotThrow(() => validateDocument("valido.pdf", "application/pdf", validPdf));
  assert.throws(() => validateDocument("falso.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4 sin contenido")), hasCode("BAD_REQUEST"));
  const executable = new Uint8Array([0x4d, 0x5a, ...new TextEncoder().encode("%%EOF")]);
  assert.throws(() => validateDocument("malicioso.pdf", "application/pdf", executable), hasCode("BAD_REQUEST"));
  assert.throws(() => validateDocument("valido.pdf", "image/png", validPdf), hasCode("BAD_REQUEST"));
});

function zip(entries: Record<string, string>) {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const n = Buffer.from(name); const data = Buffer.from(content);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data); centrals.push(central, n); offset += local.length + n.length + data.length;
  }
  const centralData = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
  return Uint8Array.from(Buffer.concat([...locals, centralData, end]));
}

test("un DOCX válido se acepta y un ZIP arbitrario renombrado se rechaza", () => {
  const valid = zip({
    "[Content_Types].xml": '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": "<Relationships/>", "word/document.xml": "<document/>",
  });
  assert.doesNotThrow(() => validateDocument("valido.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", valid));
  const invalid = zip({ "[Content_Types].xml": "<Types/>", "_rels/.rels": "<Relationships/>", "word/document.xml": "<document/>" });
  assert.throws(() => validateDocument("falso.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", invalid), hasCode("BAD_REQUEST"));
});

test("las fórmulas CSV quedan como texto literal y las comillas se escapan", () => {
  for (const value of ["=1+1", "+HYPERLINK(\"https://invalid\")", "@SUM(1,2)", "  =1+1", "\t=1+1", "\r=1+1", " -1+1"]) {
    assert.equal(csvCell(value), `"'${value.replaceAll('"', '""')}"`);
  }
  assert.equal(csvCell('texto "normal"'), '"texto ""normal"""');
  const csv = buildCsv(["valor"], [["=1+1"]]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\"'=1+1\""));
});

test("la respuesta HTTP de producción no incluye stack traces ni errores internos", async () => {
  const router = createRouter({ fail: publicQuery.query(() => { throw new Error("Detalle interno de PostgreSQL"); }) });
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc", req: new Request("http://localhost/api/trpc/fail"), router,
    createContext: () => ({ req: new Request("http://localhost"), resHeaders: new Headers(), user: null, sessionHash: null }),
  });
  const body = await response.text();
  assert.ok(body.includes("error"));
  assert.equal(body.includes("stack"), false);
  assert.equal(body.includes("Detalle interno"), false);
  assert.ok(body.includes("No se pudo completar la operación"));
});
