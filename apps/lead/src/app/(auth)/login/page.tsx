import { LoginForm } from './login-form';

export const metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="row" style={{ gap: 12 }}>
          <span className="sidebar-brand-mark">PL</span>
          <div>
            <div className="sidebar-brand-name">The Pilot Lead</div>
            <div className="sidebar-brand-sub">L’usine à rendez-vous de Breach</div>
          </div>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Connexion</h1>
          <p className="hint">Comptes internes : admin et setters.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
