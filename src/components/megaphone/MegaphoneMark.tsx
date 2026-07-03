// src/components/megaphone/MegaphoneMark.tsx
// The Megaphone mark — an inline SVG built from the brand triad (spectral → ghst-pink →
// cyan) with a color-matched glow and drifting neon sound-rings, plus a little ghost riding
// the cone. No external asset (CSP-safe), so it reads as one system with the videos + site.
export function MegaphoneMark({ size = 132, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 0 22px hsl(275 100% 70% / 0.5)) drop-shadow(0 0 46px hsl(326 100% 68% / 0.28))" }}
      role="img"
      aria-label="Megaphone"
    >
      <defs>
        <linearGradient id="mg-body" x1="18" y1="30" x2="96" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(275 100% 70%)" />
          <stop offset="0.55" stopColor="hsl(326 100% 68%)" />
          <stop offset="1" stopColor="hsl(175 100% 60%)" />
        </linearGradient>
        <linearGradient id="mg-handle" x1="30" y1="70" x2="52" y2="98" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(275 100% 70%)" />
          <stop offset="1" stopColor="hsl(326 100% 68%)" />
        </linearGradient>
      </defs>

      {/* Sound rings — three concentric neon arcs, gently pulsing outward. */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M ${74 + i * 9} ${34 - i * 6} A ${20 + i * 10} ${20 + i * 10} 0 0 1 ${74 + i * 9} ${86 + i * 6}`}
          stroke="hsl(175 100% 60%)"
          strokeWidth={3.5 - i * 0.6}
          strokeLinecap="round"
          fill="none"
          opacity={0.9 - i * 0.26}
        >
          <animate attributeName="opacity" values={`${0.9 - i * 0.26};${0.3 - i * 0.08};${0.9 - i * 0.26}`} dur="2.4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
        </path>
      ))}

      {/* Handle */}
      <rect x="30" y="70" width="14" height="26" rx="5" transform="rotate(24 37 83)" fill="url(#mg-handle)" />

      {/* Megaphone cone */}
      <path
        d="M20 47 L58 33 C63 31 68 34 68 40 L68 80 C68 86 63 89 58 87 L20 73 C16 71.5 16 48.5 20 47 Z"
        fill="url(#mg-body)"
        stroke="hsl(265 30% 96% / 0.35)"
        strokeWidth="1.5"
      />
      {/* Throat highlight */}
      <path d="M20 47 C16 48.5 16 71.5 20 73 L26 71 C23 62 23 58 26 49 Z" fill="hsl(265 60% 6% / 0.35)" />

      {/* Little ghost riding the cone */}
      <g transform="translate(38 45)">
        <path
          d="M0 26 V10 A11 11 0 0 1 22 10 V26 L18 22 L14 26 L11 22 L7 26 L4 22 Z"
          fill="hsl(265 30% 96%)"
          opacity="0.95"
        />
        <circle cx="7" cy="12" r="2.1" fill="hsl(265 60% 8%)" />
        <circle cx="15" cy="12" r="2.1" fill="hsl(265 60% 8%)" />
        <circle cx="4.5" cy="17" r="1.6" fill="hsl(326 100% 68% / 0.6)" />
        <circle cx="17.5" cy="17" r="1.6" fill="hsl(326 100% 68% / 0.6)" />
      </g>
    </svg>
  );
}
