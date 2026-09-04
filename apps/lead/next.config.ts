import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Le build tourne à la racine du monorepo (Render) : on fixe la racine de
  // traçage des fichiers pour que Next embarque les bons node_modules.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  poweredByHeader: false,
};

export default nextConfig;
