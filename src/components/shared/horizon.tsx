/**
 * Horizon — la signature visuelle de THE PILOT v4.
 * 4 couches en pure CSS + SVG, aucune image, aucun appel réseau.
 * À monter une seule fois, au plus haut niveau (RootLayout).
 */
export function Horizon() {
  return (
    <>
      <div className="horizon-bg" />
      <div className="horizon-sun" />
      <div className="horizon-blob" />
      <div className="horizon-mountains">
        <svg
          viewBox="0 0 1920 400"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          role="presentation"
          aria-hidden="true"
        >
          <path
            d="M 0 280 L 80 240 L 180 250 L 280 200 L 400 220 L 520 180 L 640 210 L 760 170 L 880 200 L 1000 160 L 1120 210 L 1240 180 L 1360 220 L 1480 190 L 1600 240 L 1720 200 L 1820 240 L 1920 220 L 1920 400 L 0 400 Z"
            fill="var(--mountain)"
            opacity="0.5"
          />
          <path
            d="M 0 320 L 100 290 L 220 310 L 340 270 L 460 300 L 580 260 L 700 290 L 820 240 L 940 280 L 1060 250 L 1180 290 L 1300 260 L 1420 300 L 1540 270 L 1660 310 L 1780 290 L 1920 320 L 1920 400 L 0 400 Z"
            fill="var(--mountain)"
            opacity="0.7"
          />
          <path
            d="M 0 360 L 120 340 L 260 350 L 400 330 L 540 350 L 680 320 L 820 340 L 960 310 L 1100 340 L 1240 320 L 1380 350 L 1520 330 L 1660 350 L 1800 340 L 1920 360 L 1920 400 L 0 400 Z"
            fill="var(--mountain-deep)"
            opacity="0.85"
          />
        </svg>
      </div>
      <div className="noise-overlay" />
    </>
  );
}
