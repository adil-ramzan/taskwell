import type { Config } from "tailwindcss";

// Swap these tokens per industry variation (SaaS, clinic, real estate).
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14213D",
        paper: "#FAFAF7",
        brand: "#2F6FED",
        "brand-dark": "#1E4FB8",
        accent: "#F2A93B",
        muted: "#5B6475",
        "dark-background": "#0F172A",
        "dark-surface": "#172033",
        "dark-muted": "#A8B0BF",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
