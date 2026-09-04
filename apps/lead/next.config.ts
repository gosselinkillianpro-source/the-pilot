import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Le build tourne à la racine du monorepo (Render) : on fixe la racine de
  // traçage des fichiers pour que Next embarque les bons node_modules.
  // fileURLToPath (et non .pathname) : le chemin contient un espace.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
};

export default nextConfig;
