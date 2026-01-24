export function placeholderSvg(seed: string, label?: string): string {
  const hue =
    seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const text = label ? ` ${label}` : "";
  return `
    <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="12" fill="hsl(${hue} 50% 95%)"/>
      <circle cx="48" cy="40" r="18" fill="hsl(${hue} 40% 85%)"/>
      <circle cx="42" cy="38" r="3" fill="hsl(${hue} 40% 30%)"/>
      <circle cx="54" cy="38" r="3" fill="hsl(${hue} 40% 30%)"/>
      <path d="M36 52c6-6 18-6 24 0" stroke="hsl(${hue} 40% 30%)" stroke-width="3" stroke-linecap="round" fill="none"/>
      <text x="48" y="86" text-anchor="middle" font-size="10" font-family="Arial" fill="hsl(${hue} 40% 25%)">${text.trim()}</text>
    </svg>
  `;
}

