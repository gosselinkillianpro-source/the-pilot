const AMF_CRITICAL_TERMS = [
  'garanti',
  'garantie',
  'garantir',
  'garantis',
  'sans risque',
  'risque zéro',
  'aucun risque',
  'sûr',
  'certain',
  'assuré',
  'crowdfunding',
  'financement participatif',
] as const;

const YIELD_MENTION_PATTERNS = [/\d+\s*%\s*(par an|annuel|de rendement)/i, /rendement[\s\w]*\d+/i];

const REQUIRED_DISCLAIMER_PATTERNS = [
  /capital\s+non\s+garanti/i,
  /rendement\s+cible/i,
  /risque\s+de\s+perte/i,
];

const AMF_SUGGESTIONS: Record<string, string> = {
  garanti: 'remplacer par "cible" ou supprimer',
  garantie: 'remplacer par "cible" ou supprimer',
  garantir: 'reformuler sans engagement de résultat',
  garantis: 'remplacer par "cibles"',
  'sans risque': 'remplacer par "avec un risque maîtrisé" et préciser le risque',
  'risque zéro': 'reformuler en explicitant le risque réel',
  'aucun risque': 'reformuler en explicitant le risque réel',
  sûr: 'éviter dans le contexte d’un rendement',
  certain: 'éviter dans le contexte d’un rendement',
  assuré: 'éviter — laisser entendre une garantie',
  crowdfunding: 'remplacer par "club deal" ou "investissement immobilier privé"',
  'financement participatif': 'remplacer par "club deal"',
};

export type AmfIssueType = 'forbidden_term' | 'missing_disclaimer';

export type AmfIssue = {
  type: AmfIssueType;
  match: string;
  context: string;
  severity: 'critical' | 'warning';
  suggestedFix: string;
};

export type AmfScanResult = {
  compliant: boolean;
  issues: AmfIssue[];
};

const SAFE_DISCLAIMER_PLACEHOLDER = '__amf_safe_disclaimer__';

/**
 * Masque les formulations de disclaimer "non garanti" ET "pas garanti"
 * (ex: "le capital n'est pas garanti") pour qu'elles ne soient pas prises pour le terme
 * interdit "garanti". Ce sont au contraire les formulations AMF attendues.
 * Un vrai usage positif ("rendement garanti") n'est PAS précédé de non/pas → reste détecté.
 */
function maskSafeDisclaimers(text: string): string {
  return text.replace(/(?:non|pas)\s+garanti(?:e|s|es)?\b/gi, SAFE_DISCLAIMER_PLACEHOLDER);
}

export function scanAmfCompliance(text: string): AmfScanResult {
  const issues: AmfIssue[] = [];
  const masked = maskSafeDisclaimers(text);
  const lowerMasked = masked.toLowerCase();

  for (const term of AMF_CRITICAL_TERMS) {
    const idx = lowerMasked.indexOf(term);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 30);
    const end = Math.min(masked.length, idx + term.length + 30);
    issues.push({
      type: 'forbidden_term',
      match: term,
      context: `...${masked.substring(start, end)}...`,
      severity: 'critical',
      suggestedFix: AMF_SUGGESTIONS[term] ?? 'reformuler pour conformité AMF',
    });
  }

  const mentionsYield = YIELD_MENTION_PATTERNS.some((re) => re.test(text));
  if (mentionsYield) {
    const hasDisclaimer = REQUIRED_DISCLAIMER_PATTERNS.some((re) => re.test(text));
    if (!hasDisclaimer) {
      issues.push({
        type: 'missing_disclaimer',
        match: 'rendement mentionné sans disclaimer',
        context: `${text.substring(0, 200)}...`,
        severity: 'critical',
        suggestedFix:
          'Ajouter "rendement cible, capital non garanti" à proximité de la mention de rendement.',
      });
    }
  }

  return {
    compliant: issues.filter((i) => i.severity === 'critical').length === 0,
    issues,
  };
}

export function assertAmfCompliant(text: string): void {
  const result = scanAmfCompliance(text);
  if (!result.compliant) {
    const summary = result.issues.map((i) => `${i.type}: ${i.match}`).join('; ');
    throw new Error(`AMF_COMPLIANCE_BLOCKED: ${summary}`);
  }
}
