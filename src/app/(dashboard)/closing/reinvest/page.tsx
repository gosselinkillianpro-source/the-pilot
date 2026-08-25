import { redirect } from 'next/navigation';

/** Fusionnée dans la liste unique : cette page est devenue la vue « Réinvestissement ». */
export default function ReinvestRedirect() {
  redirect('/closing/investisseurs?vue=reinvest');
}
