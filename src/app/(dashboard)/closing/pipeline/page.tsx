import { redirect } from 'next/navigation';

/** Fusionnée dans la liste unique : cette page est devenue la vue « Tous ». */
export default function PipelineRedirect() {
  redirect('/closing/investisseurs?vue=tous');
}
