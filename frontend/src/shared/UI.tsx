import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, Search, Inbox, LoaderCircle } from "lucide-react";
import { buildCsv } from "./csv";

const modalStack: symbol[] = [];
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export const money = (value: unknown) => new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES", minimumFractionDigits: 2 }).format(Number(value ?? 0));
export const number = (value: unknown) => new Intl.NumberFormat("es-VE").format(Number(value ?? 0));
export const date = (value: unknown) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
};
export const today = () => new Date().toISOString().slice(0, 10);
export const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());

export function Badge({ value }: { value: string }) {
  const tone = ["activo", "aprobado", "aprobada", "pagada", "procesado", "verificado"].includes(value) ? "success" : ["pendiente", "revision", "borrador", "reabierta"].includes(value) ? "warning" : ["rechazado", "rechazada", "anulado", "anulada", "egresado", "inactivo"].includes(value) ? "danger" : "info";
  return <span className={`badge ${tone}`}><span className="badge-dot" />{label(value)}</span>;
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{action && <div className="page-actions">{action}</div>}</div>;
}

export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const token = Symbol("modal");
    modalStack.push(token);
    const previous = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token || !node) return;
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key === "Tab") {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
        if (!items.length) { e.preventDefault(); return; }
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const index = modalStack.indexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      previous?.focus?.();
    };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section ref={dialogRef} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header className="modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></header><div className="modal-body">{children}</div></section></div>;
}

export function Field({ label: text, children, hint, full = false }: { label: string; children: ReactNode; hint?: string; full?: boolean }) {
  return <label className={`field ${full ? "field-full" : ""}`}><span>{text}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function SearchBox({ value, onChange, placeholder = "Buscar…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="search-box"><Search size={18} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>;
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={25} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Loading() { return <div className="loading"><LoaderCircle className="spin" size={24} /><span>Consultando información…</span></div>; }
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{children}</section>; }
export function PanelHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <header className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>; }
export function TableWrap({ children, label = "Tabla de datos" }: { children: ReactNode; label?: string }) { return <div className="table-wrap" role="region" aria-label={label} tabIndex={0}><table>{children}</table></div>; }
export function Submit({ busy, children }: { busy?: boolean; children: ReactNode }) { return <button className="button primary" type="submit" disabled={busy}>{busy && <LoaderCircle size={17} className="spin" />}{children}</button>; }
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = buildCsv(headers, rows);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
export async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
