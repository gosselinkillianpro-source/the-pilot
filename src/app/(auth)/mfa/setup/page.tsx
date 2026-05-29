import { startMfaEnrollment } from '../../actions';
import { MfaSetupForm } from './mfa-setup-form';

export const metadata = { title: 'Configuration 2FA — THE PILOT' };

export default async function MfaSetupPage() {
  const result = await startMfaEnrollment();

  if ('error' in result) {
    return (
      <p style={{ fontSize: '0.8125rem', color: 'var(--danger)', margin: 0 }}>
        {result.error} Recharge la page pour réessayer.
      </p>
    );
  }

  return <MfaSetupForm factorId={result.factorId} qrCode={result.qrCode} secret={result.secret} />;
}
