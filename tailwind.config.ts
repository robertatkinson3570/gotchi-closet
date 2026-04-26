import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  safelist: [
    "grid-cols-4",
    "sm:grid-cols-5",
    "md:grid-cols-6",
    "gap-3",
    "items-start",
    "min-w-0",
    "w-20",
    "sm:w-[88px]",
    "md:w-24",
    "lg:w-24",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        heading: ['"DM Serif Display"', "Inter", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // shadcn aliases driven by CSS vars
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand neon palette — usable as `text-spectral`, `bg-ghst-pink/20`, etc.
        spectral: "hsl(var(--spectral))",
        "ghst-pink": "hsl(var(--ghst-pink))",
        cyan: "hsl(var(--cyan))",
        ecto: "hsl(var(--ecto))",
        gold: "hsl(var(--gold))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "glow-sm": "var(--shadow-glow-sm)",
        "glow-md": "var(--shadow-glow-md)",
        "glow-lg": "var(--shadow-glow-lg)",
        lift: "var(--shadow-lift)",
        card: "var(--shadow-card)",
      },
      transitionTimingFunction: {
        spring: "var(--ease-spring)",
      },
      backgroundImage: {
        "gradient-spectral":
          "linear-gradient(120deg, hsl(var(--spectral)) 0%, hsl(var(--ghst-pink)) 50%, hsl(var(--cyan)) 100%)",
        "gradient-ecto":
          "linear-gradient(120deg, hsl(var(--ecto)) 0%, hsl(var(--cyan)) 100%)",
        "gradient-gold":
          "linear-gradient(120deg, hsl(var(--gold)) 0%, hsl(var(--ghst-pink)) 100%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Neon aura that drifts
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%":      { transform: "translate3d(0,-12px,0) scale(1.04)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "var(--shadow-glow-sm)" },
          "50%":      { boxShadow: "var(--shadow-glow-md)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        aurora:           "aurora 14s ease-in-out infinite",
        shimmer:          "shimmer 3.5s ease-in-out infinite",
        "glow-pulse":     "glow-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
