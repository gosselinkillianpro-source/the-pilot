import { redirect } from 'next/navigation';

/** Fusionnée dans la liste unique : cette page est devenue la vue « Mon portefeuille ». */
export default function PortefeuilleRedirect() {
  redirect('/closing/investisseurs?vue=portefeuille');
}
