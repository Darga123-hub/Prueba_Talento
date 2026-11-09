import { useState } from "react";
import { Plus, Download, ShieldCheck, Power, Scale, FileSpreadsheet, UsersRound, KeyRound, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/shared/providers/trpc";
import { Badge, Empty, Field, Loading, Modal, PageTitle, Panel, PanelHead, Submit, TableWrap, date, downloadCsv, label, money, today } from "@/shared/UI";

export function CatalogsView({ role }: { role: string }) {
  const [open, setOpen] = useState(false); const list = trpc.hr.catalogs.list.useQuery(); const utils = trpc.useUtils();
  const toggle = trpc.hr.catalogs.toggle.useMutation({ onSuccess: () => utils.hr.catalogs.list.invalidate(), onError: (e) => toast.error(e.message) });
  const groups = Object.values((list.data ?? []).reduce<Record<string, { category: string; items: any[] }>>((a, x) => { a[x.category] ??= { category: x.category, items: [] }; a[x.category].items.push(x); return a; }, {}));
  return <><PageTitle eyebrow="Configuración controlada" title="Catálogos" description="Dependencias, cargos, movimientos, incidencias y tipos de documentos." action={["administrador", "talento", "nomina"].includes(role) && <button className="button primary" onClick={() => setOpen(true)}><Plus size={18} />Nuevo elemento</button>} />{list.isLoading ? <Loading /> : <div className="catalog-grid">{groups.map((g) => <Panel key={g.category}><PanelHead title={label(g.category)} subtitle={`${g.items.length} elementos`} /><div className="catalog-list">{g.items.map((x) => <div key={x.id}><span className={!x.active ? "muted-text" : ""}>{x.name}</span><button className="icon-button" title={x.active ? "Desactivar" : "Activar"} onClick={() => toggle.mutate({ id: x.id, active: !x.active })}><Power size={16} className={x.active ? "success-icon" : "muted-text"} /></button></div>)}</div></Panel>)}</div>}{open && <CatalogForm onClose={() => setOpen(false)} />}</>;
}
function CatalogForm({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false); const mutation = trpc.hr.catalogs.create.useMutation(); const utils = trpc.useUtils();
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); const f = new FormData(e.currentTarget); try { await mutation.mutateAsync({ category: String(f.get("category")), name: String(f.get("name")) }); await utils.hr.catalogs.list.invalidate(); toast.success("Elemento agregado"); onClose(); } catch (err: any) { toast.error(err.message); } finally { setBusy(false); } }
  return <Modal title="Nuevo elemento de catálogo" onClose={onClose}><form className="form-grid single" onSubmit={submit}><Field label="Categoría"><select name="category">{["departamento", "cargo", "movimiento", "incidencia", "documento"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></Field><Field label="Nombre"><input name="name" required maxLength={160} /></Field><div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><Submit busy={busy}>Agregar</Submit></div></form></Modal>;
}

export function LegalView({ role }: { role: string }) {
  const [open, setOpen] = useState(false); const list = trpc.hr.legal.list.useQuery(); const utils = trpc.useUtils();
  const validate = trpc.hr.legal.validate.useMutation({ onSuccess: () => { utils.hr.legal.list.invalidate(); toast.success("Validación actualizada"); }, onError: (e) => toast.error(e.message) });
  return <><PageTitle eyebrow="Vigencia y respaldo" title="Parámetros legales" description="Registra valores, unidades, fuentes, artículos y fechas efectivas sin asumir su vigencia." action={["administrador", "talento", "nomina"].includes(role) && <button className="button primary" onClick={() => setOpen(true)}><Plus size={18} />Nuevo parámetro</button>} /><div className="notice"><Scale size={20} /><span><strong>Control documental.</strong> Un parámetro pendiente no se considera verificado. La validación final debe realizarla el administrador con el soporte legal correspondiente.</span></div><Panel>{list.isLoading ? <Loading /> : !list.data?.length ? <Empty title="Sin parámetros registrados" text="Agrega cada valor con su fuente, artículo y vigencia para su revisión." /> : <TableWrap><thead><tr><th>Parámetro</th><th>Valor</th><th>Régimen</th><th>Vigencia</th><th>Fuente y artículo</th><th>Validación</th>{role === "administrador" && <th>Acción</th>}</tr></thead><tbody>{list.data.map((x) => <tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.value} {x.unit}</td><td>{x.regime}</td><td>{date(x.effectiveDate)}</td><td className="description-cell">{x.source}<small>{x.article}</small></td><td><Badge value={x.validationStatus} /></td>{role === "administrador" && <td><select value={x.validationStatus} onChange={(e) => validate.mutate({ id: x.id, status: e.target.value as any })}><option value="pendiente">Pendiente</option><option value="verificado">Verificado</option><option value="inactivo">Inactivo</option></select></td>}</tr>)}</tbody></TableWrap>}</Panel>{open && <LegalForm onClose={() => setOpen(false)} />}</>;
}
function LegalForm({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false); const mutation = trpc.hr.legal.create.useMutation(); const utils = trpc.useUtils();
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); const f = new FormData(e.currentTarget); try { await mutation.mutateAsync({ name: String(f.get("name")), value: Number(f.get("value")), unit: String(f.get("unit")), regime: String(f.get("regime")), effectiveDate: String(f.get("effectiveDate")), source: String(f.get("source")), article: String(f.get("article")) }); await utils.hr.legal.list.invalidate(); toast.success("Parámetro registrado como pendiente"); onClose(); } catch (err: any) { toast.error(err.message); } finally { setBusy(false); } }
  return <Modal title="Nuevo parámetro legal" description="Se creará con estado pendiente de validación." onClose={onClose} wide><form className="form-grid" onSubmit={submit}><Field label="Nombre" full><input name="name" required /></Field><Field label="Valor"><input name="value" type="number" min="0" step="0.0001" required /></Field><Field label="Unidad"><input name="unit" placeholder="% , días, Bs., U.T." required /></Field><Field label="Régimen"><input name="regime" defaultValue="General" required /></Field><Field label="Fecha efectiva"><input name="effectiveDate" type="date" defaultValue={today()} required /></Field><Field label="Fuente documental" full><textarea name="source" rows={3} placeholder="Gaceta, ley, resolución o documento anexo" required /></Field><Field label="Artículo o referencia" full><input name="article" /></Field><div className="form-actions field-full"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><Submit busy={busy}>Registrar parámetro</Submit></div></form></Modal>;
}

export function ReportsView() {
  const people = trpc.hr.employees.list.useQuery({ status: "todos" }); const payroll = trpc.hr.payroll.list.useQuery(); const processes = trpc.hr.processes.list.useQuery();
  const rows = people.data ?? []; const byType = Object.values(rows.reduce<Record<string, { name: string; count: number }>>((a, p) => { a[p.personnelType] ??= { name: p.personnelType, count: 0 }; a[p.personnelType].count++; return a; }, {}));
  const byDept = Object.values(rows.reduce<Record<string, { name: string; count: number }>>((a, p) => { a[p.department] ??= { name: p.department, count: 0 }; a[p.department].count++; return a; }, {})).sort((a, b) => b.count - a.count);
  const totalPaid = (payroll.data ?? []).filter((p) => p.status === "pagada").reduce((s, p) => s + Number(p.totalNet), 0);
  return <><PageTitle eyebrow="Información para la gestión" title="Reportes y estadísticas" description="Resúmenes exportables construidos con los registros actuales del módulo." action={<button className="button secondary" disabled={!rows.length} onClick={() => downloadCsv("reporte-personal.csv", ["Documento", "Nombres", "Apellidos", "Dependencia", "Cargo", "Tipo", "Régimen", "Ingreso", "Estatus", "Salario base"], rows.map((p) => [p.documentId, p.firstName, p.lastName, p.department, p.position, p.personnelType, p.regime, date(p.hireDate), p.status, p.baseSalary]))}><Download size={18} />Exportar personal</button>} /><div className="stats-grid"><div className="stat"><span>Expedientes</span><strong>{rows.length}</strong><small>{rows.filter((p) => p.status === "activo").length} activos</small></div><div className="stat"><span>Nóminas registradas</span><strong>{payroll.data?.length ?? 0}</strong><small>{payroll.data?.filter((p) => p.status === "pagada").length ?? 0} pagadas</small></div><div className="stat"><span>Neto pagado acumulado</span><strong className="stat-money">{money(totalPaid)}</strong><small>Solo nóminas con pago registrado</small></div><div className="stat"><span>Procesos especiales</span><strong>{processes.data?.length ?? 0}</strong><small>{processes.data?.filter((p) => p.status === "pendiente").length ?? 0} pendientes</small></div></div><div className="two-columns"><Panel><PanelHead title="Personal por dependencia" subtitle="Distribución de todos los expedientes" />{!byDept.length ? <Empty title="Sin datos" text="Registra personal para generar este reporte." /> : <div className="bar-list">{byDept.map((d) => <div key={d.name}><div><span>{d.name}</span><strong>{d.count}</strong></div><div className="bar-track"><span style={{ width: `${d.count / Math.max(rows.length, 1) * 100}%` }} /></div></div>)}</div>}</Panel><Panel><PanelHead title="Composición del personal" subtitle="Según tipo registrado" />{!byType.length ? <Empty title="Sin datos" text="No hay composición disponible." /> : <div className="report-list">{byType.map((t) => <div key={t.name}><span>{label(t.name)}</span><strong>{t.count}</strong></div>)}</div>}<button className="button secondary full-width" disabled={!payroll.data?.length} onClick={() => downloadCsv("reporte-nominas.csv", ["Código", "Nombre", "Tipo", "Desde", "Hasta", "Asignaciones", "Deducciones", "Neto", "Estado"], (payroll.data ?? []).map((p) => [p.code, p.name, p.type, date(p.periodStart), date(p.periodEnd), p.totalAssignments, p.totalDeductions, p.totalNet, p.status]))}><FileSpreadsheet size={17} />Exportar nóminas</button></Panel></div></>;
}

export function AuditView() {
  const list = trpc.hr.audit.list.useQuery({ limit: 150 });
  return <><PageTitle eyebrow="Trazabilidad" title="Bitácora de auditoría" description="Quién hizo cada operación, sobre qué registro y en qué momento." action={<button className="button secondary" disabled={!list.data?.length} onClick={() => downloadCsv("bitacora-rrhh.csv", ["Fecha", "Usuario", "Acción", "Entidad", "ID", "Detalle"], (list.data ?? []).map((x) => [date(x.createdAt), x.userName, x.action, x.entity, x.entityId, x.detail]))}><Download size={18} />Exportar</button>} /><Panel>{list.isLoading ? <Loading /> : !list.data?.length ? <Empty title="Sin actividad registrada" text="Las operaciones del módulo quedarán documentadas aquí." /> : <TableWrap><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody>{list.data.map((x) => <tr key={x.id}><td>{date(x.createdAt)}<small>{new Date(x.createdAt).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}</small></td><td>{x.userName || "Sistema"}</td><td><Badge value={x.action.toLowerCase()} /></td><td>{x.entity}<small>ID {x.entityId || "—"}</small></td><td>{x.detail || "—"}</td></tr>)}</tbody></TableWrap>}</Panel></>;
}

const roleNames: Record<string, string> = { administrador: "Administrador general", talento: "Talento Humano", nomina: "Nómina", aprobador: "Aprobador", tesoreria: "Tesorería", consulta: "Consulta / Auditoría", trabajador: "Trabajador" };
export function UsersView() {
  const list = trpc.hr.users.list.useQuery();
  const people = trpc.hr.employees.list.useQuery({ status: "todos", limit: 200 });
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<any | "self" | null>(null);
  const utils = trpc.useUtils();
  const refresh = async () => { await utils.hr.users.list.invalidate(); };
  return <><PageTitle eyebrow="Seguridad y segregación" title="Usuarios y perfiles" description="Crea cuentas reales, asigna perfiles y controla su estado y acceso." action={<div className="button-group"><button className="button secondary" onClick={() => setPasswordUser("self")}><KeyRound size={17} />Cambiar mi contraseña</button><button className="button primary" onClick={() => setCreateOpen(true)}><UserPlus size={17} />Crear usuario</button></div>} />
    <div className="notice"><ShieldCheck size={20} /><span>Solo un administrador global puede gestionar cuentas. Desactivar, cambiar el perfil o restablecer la contraseña revoca todas las sesiones del usuario.</span></div>
    <Panel><PanelHead title="Cuentas registradas" subtitle="Las contraseñas nunca se muestran ni se incluyen en las respuestas." />{list.isLoading ? <Loading /> : !list.data?.length ? <Empty title="Sin usuarios" text="Crea el primer usuario para comenzar." /> : <TableWrap><thead><tr><th>Usuario</th><th>Correo</th><th>Último acceso</th><th>Perfil y expediente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{list.data.map((u) => <UserRow key={u.id} user={u} people={people.data ?? []} onSaved={refresh} onPassword={() => setPasswordUser(u)} />)}</tbody></TableWrap>}</Panel>
    {createOpen && <CreateUserForm people={people.data ?? []} onClose={() => setCreateOpen(false)} onDone={async () => { setCreateOpen(false); await refresh(); }} />}
    {passwordUser && <PasswordForm user={passwordUser} onClose={() => setPasswordUser(null)} />}
  </>;
}

function UserRow({ user, people, onSaved, onPassword }: { user: any; people: any[]; onSaved: () => Promise<void>; onPassword: () => void }) {
  const [role, setRole] = useState(user.profile?.rrhhRole ?? "consulta");
  const [employeeId, setEmployeeId] = useState(String(user.employeeId ?? ""));
  const setRoleMutation = trpc.hr.users.setRole.useMutation();
  const setActive = trpc.hr.users.setActive.useMutation();
  const save = async () => {
    try {
      await setRoleMutation.mutateAsync({ userId: user.id, rrhhRole: role as any, employeeId: role === "trabajador" ? Number(employeeId) : null });
      await onSaved(); toast.success("Perfil actualizado y sesiones revocadas");
    } catch (error: any) { toast.error(error.message); }
  };
  const toggle = async () => {
    try { await setActive.mutateAsync({ userId: user.id, active: !!user.disabledAt }); await onSaved(); toast.success("Estado actualizado"); } catch (error: any) { toast.error(error.message); }
  };
  return <tr><td><div className="person-cell"><span className="avatar"><UsersRound size={17} /></span><div><strong>{user.name || user.username}</strong><small>{user.username}{user.role === "admin" ? " · Administrador global" : ""}</small></div></div></td><td>{user.email || "—"}</td><td>{date(user.lastSignInAt)}</td><td><select aria-label={`Perfil de ${user.username}`} value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(roleNames).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>{role === "trabajador" && <select aria-label={`Expediente de ${user.username}`} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Vincular expediente…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.documentId}</option>)}</select>}</td><td><Badge value={user.disabledAt ? "inactivo" : "activo"} /></td><td><div className="row-actions"><button className="button tiny" disabled={setRoleMutation.isPending || (role === "trabajador" && !employeeId)} onClick={save}>Guardar</button><button className="icon-button" title="Restablecer contraseña" aria-label={`Restablecer contraseña de ${user.username}`} onClick={onPassword}><KeyRound size={16} /></button><button className="button tiny" disabled={setActive.isPending} onClick={toggle}>{user.disabledAt ? "Activar" : "Desactivar"}</button></div></td></tr>;
}

function CreateUserForm({ people, onClose, onDone }: { people: any[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [role, setRole] = useState("consulta"); const mutation = trpc.hr.users.create.useMutation();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true);
    try {
      await mutation.mutateAsync({ username: String(f.get("username")), name: String(f.get("name")), email: String(f.get("email")), password: String(f.get("password")), globalAdmin: f.get("globalAdmin") === "on", rrhhRole: role as any, employeeId: role === "trabajador" ? Number(f.get("employeeId")) : null });
      toast.success("Usuario creado"); await onDone();
    } catch (error: any) { toast.error(error.message); } finally { setBusy(false); }
  };
  return <Modal title="Crear usuario real" description="La contraseña debe tener al menos 12 caracteres, mayúsculas, minúsculas, números y símbolos." onClose={onClose} wide><form className="form-grid" onSubmit={submit}><Field label="Usuario"><input name="username" autoComplete="off" pattern="[a-z0-9._-]+" required /></Field><Field label="Nombre"><input name="name" required /></Field><Field label="Correo"><input name="email" type="email" /></Field><Field label="Contraseña inicial"><input name="password" type="password" autoComplete="new-password" minLength={12} required /></Field><Field label="Perfil RRHH"><select value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(roleNames).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></Field>{role === "trabajador" && <Field label="Expediente vinculado"><select name="employeeId" required defaultValue=""><option value="" disabled>Selecciona un expediente</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.documentId}</option>)}</select></Field>}<Field label="Privilegio global" full><span><input name="globalAdmin" type="checkbox" /> Administrador global (puede gestionar usuarios)</span></Field><div className="form-actions field-full"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><Submit busy={busy}>Crear usuario</Submit></div></form></Modal>;
}

function PasswordForm({ user, onClose }: { user: any; onClose: () => void }) {
  const self = user === "self"; const [busy, setBusy] = useState(false);
  const change = trpc.hr.users.changePassword.useMutation(); const reset = trpc.hr.users.resetPassword.useMutation();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true);
    try {
      if (self) await change.mutateAsync({ currentPassword: String(f.get("currentPassword")), newPassword: String(f.get("newPassword")) });
      else await reset.mutateAsync({ userId: user.id, newPassword: String(f.get("newPassword")) });
      toast.success(self ? "Contraseña cambiada. Vuelve a iniciar sesión." : "Contraseña restablecida y sesiones revocadas"); onClose();
      if (self) window.location.assign("/login");
    } catch (error: any) { toast.error(error.message); } finally { setBusy(false); }
  };
  return <Modal title={self ? "Cambiar mi contraseña" : `Restablecer contraseña de ${user.username}`} description="La operación invalida todas las sesiones anteriores." onClose={onClose}><form className="form-grid single" onSubmit={submit}>{self && <Field label="Contraseña actual"><input name="currentPassword" type="password" autoComplete="current-password" required /></Field>}<Field label="Nueva contraseña" hint="Mínimo 12 caracteres con mayúsculas, minúsculas, números y símbolos."><input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></Field><div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><Submit busy={busy}>Guardar contraseña</Submit></div></form></Modal>;
}
