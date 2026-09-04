import { redirect } from 'next/navigation';

// Le menu « Closing » ouvre le poste du jour : où j'en suis, ce que je fais, le pool.
export default function ClosingIndexPage() {
  redirect('/closing/aujourdhui');
}
