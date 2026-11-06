import { Link } from "react-router";
import "../shared/styles/App.css";

export default function NotFound() {
  return (
    <main className="app-loading">
      <section className="panel" style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
        <span className="brand-mark" style={{ margin: "0 auto 18px" }}>TH</span>
        <h1>Página no encontrada</h1>
        <p>La dirección solicitada no existe dentro del módulo.</p>
        <Link className="button primary" to="/" style={{ marginTop: 18 }}>Volver al resumen</Link>
      </section>
    </main>
  );
}
