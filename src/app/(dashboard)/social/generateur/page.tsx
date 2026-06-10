import { BrainGenerator } from './brain-generator';

export const dynamic = 'force-dynamic';

export default function GenerateurPage() {
  return (
    <>
      <div>
        <h1 className="page-title">Générateur de posts</h1>
        <div className="page-desc">
          Brain Réseaux — contenu + slides HTML premium (gabarits L1–L7, 1080×1350) prêtes à
          importer dans Figma via le plugin « HTML to Design ».
        </div>
      </div>
      <BrainGenerator />
    </>
  );
}
