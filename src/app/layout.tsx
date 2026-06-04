import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Horizon } from '@/components/shared/horizon';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'THE PILOT — Seven At Home',
  description: 'Cabine de pilotage marketing 360 propulsée par IA, sur-mesure pour Seven At Home.',
};

// Rendu mobile correct : largeur = écran, zoom autorisé (accessibilité), zones sûres iOS.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      data-theme="light"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body>
        <Horizon />
        {children}
      </body>
    </html>
  );
}
