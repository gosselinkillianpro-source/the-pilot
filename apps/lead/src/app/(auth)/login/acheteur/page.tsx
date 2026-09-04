import { MagicForm } from './magic-form';

export const metadata = { title: 'Espace acheteur' };

export default function BuyerLoginPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="row" style={{ gap: 12 }}>
          <span className="sidebar-brand-mark">PL</span>
          <div>
            <div className="sidebar-brand-name">Espace acheteur</div>
            <div className="sidebar-brand-sub">Vos rendez-vous, vos validations</div>
          </div>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Connexion sans mot de passe</h1>
          <p className="hint">Nous vous envoyons un lien par email.</p>
        </div>
        <MagicForm />
      </div>
    </div>
  );
}
