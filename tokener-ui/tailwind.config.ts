import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#07191E",
          900: "#04100F",
          800: "#07191E",
          700: "#0C2229",
          600: "#123039",
          500: "#1B434D",
        },
        // Surfaces, borders, text and the pale accent tints are CSS variables so the console can switch to a dark theme.
        // The marketing site never sets data-theme, so it always resolves to the light values in globals.css.
        emph: { DEFAULT: "rgb(var(--c-emph) / <alpha-value>)", hover: "rgb(var(--c-emph-hover) / <alpha-value>)" },
        "on-emph": "rgb(var(--c-on-emph) / <alpha-value>)",
        note: "rgb(var(--c-note) / <alpha-value>)",
        accent: {
          DEFAULT: "#02F5A1",
          50: "rgb(var(--c-accent-50) / <alpha-value>)",
          100: "rgb(var(--c-accent-100) / <alpha-value>)",
          300: "#5CF7C1",
          500: "#02F5A1",
          600: "#00D98D",
          700: "#00B876",
        },
        surface: {
          DEFAULT: "rgb(var(--c-surface) / <alpha-value>)",
          subtle: "rgb(var(--c-surface-subtle) / <alpha-value>)",
          muted: "rgb(var(--c-surface-muted) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--c-border) / <alpha-value>)",
          strong: "rgb(var(--c-border-strong) / <alpha-value>)",
        },
        text: {
          primary: "rgb(var(--c-text-primary) / <alpha-value>)",
          secondary: "rgb(var(--c-text-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--c-text-tertiary) / <alpha-value>)",
          inverse: "#F2F7F6",
        },
        status: {
          healthy: "#02C57B",
          degraded: "#D98A15",
          down: "#DC3B3B",
          info: "#2F6FE0",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
        editorial: ['"Instrument Serif"', "Georgia", "serif"],
        hand: ["Caveat", '"Segoe Print"', '"Bradley Hand"', "cursive"],
        code: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      keyframes: {
        "slide-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { "slide-in": "slide-in 450ms ease-out" },
      boxShadow: {
        card: "0 1px 2px rgba(7,25,30,0.04), 0 1px 0 rgba(7,25,30,0.03)",
        popover: "0 8px 24px rgba(7,25,30,0.12), 0 2px 6px rgba(7,25,30,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
