'use client';

import { BellRing, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/shared/toast';
import { saveTelegramChatId, sendTestAlert } from './actions';

/**
 * Branchement du canal d'alerte, par le closer lui-même.
 *
 * Le bouton de test n'est pas un gadget : sans lui, on ne sait qu'un canal est
 * cassé (bot bloqué, mauvais identifiant) qu'au moment où un vrai lead est
 * perdu.
 */
export function TelegramForm({ initial }: { initial: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [chatId, setChatId] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveTelegramChatId({ chatId: chatId.trim() });
      if (res.success) {
        router.refresh();
        toast(chatId.trim() ? 'Canal enregistré.' : 'Alertes désactivées.', { variant: 'success' });
      } else {
        toast(res.error ?? 'Enregistrement impossible', { variant: 'error' });
      }
    });
  }

  function test() {
    startTransition(async () => {
      const res = await sendTestAlert();
      if (res.success) toast('Message envoyé — regarde ton téléphone.', { variant: 'success' });
      else toast(res.error ?? 'Envoi impossible', { variant: 'error' });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          Mon identifiant Telegram (que des chiffres)
        </span>
        <input
          className="input"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="123456789"
          inputMode="numeric"
          style={{ maxWidth: 260 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={save}>
          <BellRing size={13} />
          Enregistrer
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pending || !initial}
          onClick={test}
          title={initial ? 'Envoyer un message de test' : "Enregistre d'abord ton identifiant"}
        >
          <Send size={13} />
          Envoyer un test
        </button>
      </div>
    </div>
  );
}
