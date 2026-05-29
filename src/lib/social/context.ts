/**
 * Construction du contexte marque injecté dans les prompts du Social Hub.
 *
 * ⚠️ Ne renvoie QUE des données marketing/business :
 * - notes de contexte éditoriales (social_context_notes)
 * - projets SAH actifs (table projects — données business, pas de PII)
 * Aucune donnée investisseur. Le résultat part vers OpenRouter (hors UE) via le client gardé.
 */

import { and, desc, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, socialContextNotes } from '@/lib/db/schema';

function formatEuro(value: string | null): string {
  if (!value) return '';
  const n = Number(value);
  if (Number.isNaN(n)) return '';
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export async function buildSocialMemoryContext(): Promise<string> {
  const [notes, activeProjects] = await Promise.all([
    db.select().from(socialContextNotes).orderBy(desc(socialContextNotes.updatedAt)),
    db
      .select()
      .from(projects)
      .where(and(ne(projects.status, 'completed'), ne(projects.status, 'cancelled')))
      .orderBy(desc(projects.createdAt)),
  ]);

  const parts: string[] = [];

  if (notes.length > 0) {
    parts.push('## Notes de contexte éditorial');
    for (const note of notes) {
      parts.push(`\n### ${note.title}\n${note.content}`);
    }
  }

  parts.push('\n## Projets SAH actifs sur la plateforme');
  if (activeProjects.length === 0) {
    parts.push('(aucun projet actif renseigné — ne jamais inventer de projet)');
  } else {
    for (const p of activeProjects) {
      const lines: string[] = [`### ${p.name}`];
      if (p.locationCity) lines.push(`- Localisation : ${p.locationCity}`);
      lines.push(`- Statut : ${p.status}`);
      if (p.targetAmount) {
        const collected = formatEuro(p.collectedAmount);
        const target = formatEuro(p.targetAmount);
        const pct =
          p.targetAmount && p.collectedAmount
            ? Math.round((Number(p.collectedAmount) / Number(p.targetAmount)) * 100)
            : 0;
        lines.push(`- Collecte : ${collected} / ${target} (${pct}%)`);
      }
      if (p.targetYieldAnnual)
        lines.push(`- Rendement cible : ${p.targetYieldAnnual}% (capital non garanti)`);
      if (p.durationMonths) lines.push(`- Durée cible : ${p.durationMonths} mois`);
      if (p.descriptionShort) lines.push(`- Description : ${p.descriptionShort}`);
      parts.push(lines.join('\n'));
    }
  }

  return parts.join('\n');
}
