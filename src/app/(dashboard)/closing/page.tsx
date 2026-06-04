import { redirect } from 'next/navigation';

// Le menu "Closing" ouvre directement la file d'appels (qui appeler, dans l'ordre).
export default function ClosingIndexPage() {
  redirect('/closing/queue');
}
