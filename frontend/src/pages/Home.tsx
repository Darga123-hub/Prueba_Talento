import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router";
import { Toaster } from "sonner";
import { LayoutDashboard, Users, ArrowLeftRight, CalendarClock, Sparkles, WalletCards, Sigma, LibraryBig, Scale, ChartNoAxesCombined, ScrollText, ShieldCheck, Menu, X, Search, LogOut, Plus, ChevronRight, Database, CircleCheck, Clock3 } from "lucide-react";
import { trpc } from "@/shared/providers/trpc";
import { useAuth } from "@/shared/hooks/useAuth";
import { PeopleView } from "@/modules/personal/People";
import { MovementsView, IncidentsView, ProcessesView } from "@/modules/operaciones/Operations";
import { ConceptsView, PayrollView } from "@/modules/nomina/Payroll";
import { CatalogsView, LegalView, ReportsView, AuditView, UsersView } from "@/modules/administracion/Admin";
import { Badge, Empty, Loading, Panel, PanelHead, date, money } from "@/shared/UI";
import "../shared/styles/App.css";

const navigation = [
  { section: "General", items: [["dashboard", "Resumen", LayoutDashboard], ["personal", "Personal", Users]] },
  { section: "Gestión laboral", items: [["movimientos", "Movimientos", ArrowLeftRight], ["incidencias", "Incidencias", CalendarClock], ["procesos", "Procesos especiales", Sparkles]] },
  { section: "Nómina", items: [["nomina", "Nómina y recibos", WalletCards], ["conceptos", "Conceptos y fórmulas", Sigma]] },
  { section: "Administración", items: [["catalogos", "Catálogos", LibraryBig], ["legal", "Parámetros legales", Scale], ["reportes", "Reportes", ChartNoAxesCombined], ["auditoria", "Auditoría", ScrollText], ["usuarios", "Usuarios y perfiles", ShieldCheck]] },
] as const;

export default function Home() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [view, setView] = useState("dashboard"); const [menu, setMenu] = useState(false); const [globalSearch, setGlobalSearch] = useState("");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const session = trpc.hr.session.useQuery(undefined, { enabled: isAuthenticated });
  const catalogs = trpc.hr.catalogs.list.useQuery(undefined, { enabled: isAuthenticated });
  useEffect(() => {
    if (menu) { document.querySelector<HTMLElement>(".sidebar nav button")?.focus(); }
    else if (menuButtonRef.current && document.activeElement?.closest(".sidebar")) { menuButtonRef.current.focus(); }
  }, [menu]);
  if (isLoading) return <div className="app-loading"><span className="brand-mark">TH</span><Loading /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const role = session.data?.role ?? (user?.role === "admin" ? "administrador" : "consulta");
  const go = (v: string) => { setView(v); setMenu(false); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
  return <div className="app-shell">
    {menu && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? "open" : ""}`} onKeyDown={(e) => { if (e.key === "Escape") { setMenu(false); menuButtonRef.current?.focus(); } }}>
      <div className="brand"><span className="brand-mark">TH</span><div><strong>Talento Humano</strong><small>Gestión administrativa</small></div><button className="sidebar-close" onClick={() => setMenu(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      <nav className="main-nav" aria-label="Navegación principal">{navigation.map((group) => <div className="nav-group" key={group.section}><span className="nav-label">{group.section}</span>{group.items.map(([id, text, Icon]) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => go(id)}><Icon size={19} strokeWidth={1.8} /><span>{text}</span>{view === id && <ChevronRight size={15} className="nav-chevron" />}</button>)}</div>)}</nav>
      <div className="sidebar-foot"><div className="system-status"><CircleCheck size={16} /><div><strong>Sistema operativo</strong><small>Datos centralizados</small></div></div><span className="version">Módulo RRHH · v1.0</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><button ref={menuButtonRef} className="menu-button" onClick={() => setMenu(true)} aria-label="Abrir menú"><Menu size={22} /></button><form className="global-search" onSubmit={(e) => { e.preventDefault(); go("personal"); }}><Search size={18} /><input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Buscar expediente por nombre, cédula o cargo" aria-label="Buscar expediente por nombre, cédula o cargo" /><kbd>Enter</kbd></form><div className="topbar-user"><span className="user-avatar">{user?.name?.slice(0, 1).toUpperCase() || "U"}</span><div><strong>{user?.name || "Usuario"}</strong><small>{role === "administrador" ? "Administrador general" : role}</small></div><button className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout}><LogOut size={18} /></button></div></header>
      <main className="content">
        {view === "dashboard" && <Dashboard onNavigate={go} role={role} />}
        {view === "personal" && <PeopleView key={globalSearch} role={role} catalogs={catalogs.data ?? []} initialSearch={globalSearch} />}
        {view === "movimientos" && <MovementsView role={role} />}
        {view === "incidencias" && <IncidentsView role={role} />}
        {view === "procesos" && <ProcessesView role={role} />}
        {view === "nomina" && <PayrollView role={role} />}
        {view === "conceptos" && <ConceptsView role={role} />}
        {view === "catalogos" && <CatalogsView role={role} />}
        {view === "legal" && <LegalView role={role} />}
        {view === "reportes" && <ReportsView />}
        {view === "auditoria" && <AuditView />}
        {view === "usuarios" && (role === "administrador" ? <UsersView /> : <Empty title="Acceso restringido" text="Solo el administrador general puede gestionar usuarios y perfiles." />)}
      </main>
      <footer className="app-footer"><span><Database size={14} />Información persistente y protegida por perfiles</span><span>Las validaciones legales requieren respaldo documental</span></footer>
    </div><Toaster position="top-right" richColors closeButton />
  </div>;
}

function Dashboard({ onNavigate, role }: { onNavigate: (v: string) => void; role: string }) {
  const { data, isLoading } = trpc.hr.dashboard.useQuery(); const hour = new Date().getHours(); const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  if (isLoading || !data) return <Loading />;
  return <><div className="dashboard-hero"><div><span className="eyebrow">{greeting}</span><h1>Resumen de gestión</h1><p>Consulta la actividad del personal y el avance de las operaciones de nómina.</p></div>{["administrador", "talento"].includes(role) && <button className="button light" onClick={() => onNavigate("personal")}><Plus size={18} />Nuevo expediente</button>}</div>
    <div className="stats-grid"><button className="stat" onClick={() => onNavigate("personal")}><span>Personal activo</span><strong>{data.counts.active}</strong><small>{data.counts.total} expedientes en total</small><Users size={22} /></button><button className="stat" onClick={() => onNavigate("procesos")}><span>Procesos pendientes</span><strong>{data.counts.pending}</strong><small>Requieren revisión o aprobación</small><Clock3 size={22} /></button><button className="stat" onClick={() => onNavigate("nomina")}><span>Nóminas en curso</span><strong>{data.counts.openPayrolls}</strong><small>Desde borrador hasta cierre</small><WalletCards size={22} /></button><button className="stat" onClick={() => onNavigate("reportes")}><span>Neto pagado</span><strong className="stat-money">{money(data.monthlyNet)}</strong><small>Acumulado de nóminas pagadas</small><ChartNoAxesCombined size={22} /></button></div>
    <div className="dashboard-grid"><Panel><PanelHead title="Nómina reciente" subtitle="Últimos ciclos registrados" action={<button className="text-button" onClick={() => onNavigate("nomina")}>Ver todas <ChevronRight size={15} /></button>} />{!data.payrolls.length ? <Empty title="Aún no hay nóminas" text="El próximo ciclo calculado aparecerá en este panel." /> : <div className="compact-list">{data.payrolls.slice(0, 5).map((p) => <button key={p.id} onClick={() => onNavigate("nomina")}><span className="list-icon"><WalletCards size={18} /></span><div><strong>{p.name}</strong><small>{p.code} · {date(p.periodEnd)}</small></div><span className="list-amount">{money(p.totalNet)}</span><Badge value={p.status} /></button>)}</div>}</Panel>
      <Panel><PanelHead title="Actividad reciente" subtitle="Trazabilidad de las operaciones" action={<button className="text-button" onClick={() => onNavigate("auditoria")}>Bitácora <ChevronRight size={15} /></button>} />{!data.activity.length ? <Empty title="Sin actividad todavía" text="Los registros y cambios aparecerán aquí." /> : <div className="activity-list">{data.activity.map((a) => <div key={a.id}><span className="activity-dot" /><div><strong>{a.action} · {a.entity}</strong><p>{a.detail || "Operación registrada"}</p><small>{a.userName || "Sistema"} · {date(a.createdAt)}</small></div></div>)}</div>}</Panel></div>
    <Panel><PanelHead title="Distribución por dependencia" subtitle="Personal activo registrado" action={<button className="text-button" onClick={() => onNavigate("reportes")}>Ver reportes <ChevronRight size={15} /></button>} />{!data.byDepartment.length ? <Empty title="Sin distribución disponible" text="Registra expedientes activos para visualizar la composición del personal." /> : <div className="department-bars">{data.byDepartment.map((d) => <div key={d.name}><div><span>{d.name}</span><strong>{d.count}</strong></div><div className="bar-track"><span style={{ width: `${d.count / Math.max(data.counts.active, 1) * 100}%` }} /></div></div>)}</div>}</Panel>
  </>;
}
