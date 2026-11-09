import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Eye, EyeOff, FileCheck2, LockKeyhole, ShieldCheck, UserRound, UsersRound, WalletCards } from "lucide-react";
import { trpc } from "@/shared/providers/trpc";
import "./login.css";

const demoAccounts = [
  { username: "admin.demo", label: "Administrador", detail: "Acceso completo" },
  { username: "talento.demo", label: "Talento Humano", detail: "Expedientes y operaciones" },
  { username: "nomina.demo", label: "Nómina", detail: "Cálculo y conceptos" },
  { username: "aprobador.demo", label: "Aprobador", detail: "Aprobación independiente" },
  { username: "tesoreria.demo", label: "Tesorería", detail: "Registro de pagos" },
  { username: "consulta.demo", label: "Consulta", detail: "Solo lectura" },
];
const DEMO_PASSWORD = "DemoRRHH2026!";
const demoEnabled = import.meta.env.VITE_DEMO_MODE === "true";

export default function Login() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [username, setUsername] = useState(demoEnabled ? "admin.demo" : "");
  const [password, setPassword] = useState(demoEnabled ? DEMO_PASSWORD : "");
  const [showPassword, setShowPassword] = useState(false);
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/", { replace: true });
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <main className="rrhh-login">
      <section className="rrhh-login__showcase">
        <div className="rrhh-login__brand"><span className="rrhh-login__brandmark">TH</span><span>Gestión administrativa</span></div>
        <div className="rrhh-login__hero">
          <span className="rrhh-login__eyebrow"><ShieldCheck size={16} /> Acceso protegido por perfiles</span>
          <h1>Talento humano,<span>gestión más clara.</span></h1>
          <p>Expedientes, procesos laborales y nómina reunidos en un espacio seguro, trazable y fácil de usar.</p>
          <div className="rrhh-login__features">
            <span><UsersRound size={16} /> Expedientes centralizados</span>
            <span><WalletCards size={16} /> Nómina controlada</span>
            <span><FileCheck2 size={16} /> Auditoría de operaciones</span>
          </div>
        </div>
        <p className="rrhh-login__note">{demoEnabled ? "Entorno de demostración: no uses información personal real." : "Acceso privado a la gestión de Talento Humano."}</p>
      </section>

      <section className="rrhh-login__access">
        <div className="rrhh-login__card">
          <div className="rrhh-login__heading">
            <span className="rrhh-login__lock"><LockKeyhole size={23} /></span>
            <div><small>Módulo de RRHH</small><h2>Bienvenido</h2></div>
          </div>
          <p className="rrhh-login__intro">{demoEnabled ? "Ingresa con una cuenta demo o selecciona el perfil que deseas probar." : "Ingresa con tu usuario y contraseña."}</p>
          <form onSubmit={submit} className="rrhh-login__form">
            <label className="rrhh-login__field">Usuario
              <div className="rrhh-login__input"><UserRound size={18} /><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></div>
            </label>
            <label className="rrhh-login__field">Contraseña
              <div className="rrhh-login__input"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </label>
            {login.error && <div className="rrhh-login__error" role="alert">{login.error.message}</div>}
            <button className="rrhh-login__submit" type="submit" disabled={login.isPending}>{login.isPending ? "Verificando acceso…" : <>Entrar al módulo <ArrowRight size={18} /></>}</button>
          </form>

          {demoEnabled && <><div className="rrhh-login__divider"><span>Perfiles de demostración</span></div>
            <div className="rrhh-login__demo">{demoAccounts.map((account) => <button key={account.username} type="button" aria-pressed={username === account.username} className={username === account.username ? "selected" : ""} onClick={() => { setUsername(account.username); setPassword(DEMO_PASSWORD); login.reset(); }}><strong>{account.label}</strong><small>{account.username}</small><span>{account.detail}</span></button>)}</div>
            <p className="rrhh-login__password">Contraseña para todos: <code>{DEMO_PASSWORD}</code></p>
            <p className="rrhh-login__warning">Solo para pruebas. Desactiva estas cuentas y el modo demo antes de producción.</p></>}
        </div>
        <p className="rrhh-login__footer">Gestión de Talento Humano · Acceso seguro y trazable</p>
      </section>
    </main>
  );
}
